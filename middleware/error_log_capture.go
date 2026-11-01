package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// errorCaptureWriter 只缓存响应体前 1KB，仅在状态码 >=400 时使用，正常请求零额外开销。
type errorCaptureWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

const errorCaptureLimit = 1024

func (w *errorCaptureWriter) Write(b []byte) (int, error) {
	if w.body.Len() < errorCaptureLimit {
		remain := errorCaptureLimit - w.body.Len()
		if len(b) <= remain {
			w.body.Write(b)
		} else {
			w.body.Write(b[:remain])
		}
	}
	return w.ResponseWriter.Write(b)
}

func (w *errorCaptureWriter) WriteString(s string) (int, error) {
	if w.body.Len() < errorCaptureLimit {
		remain := errorCaptureLimit - w.body.Len()
		if len(s) <= remain {
			w.body.WriteString(s)
		} else {
			w.body.WriteString(s[:remain])
		}
	}
	return w.ResponseWriter.WriteString(s)
}

// ErrorLogCapture 捕获 /v1 下所有 4xx/5xx 响应并写入错误日志表(type=5)。
// 覆盖原来只在“渠道重试全部失败”时才会记录的盲区：鉴权失败、参数错误、
// 令牌额度不足、模型不存在、频率限制等。
func ErrorLogCapture() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !constant.ErrorLogEnabled {
			c.Next()
			return
		}
		// 完全没带凭据的请求视为探测/扫描，不记录，避免噪音
		if !hasCredential(c) {
			c.Next()
			return
		}
		writer := &errorCaptureWriter{ResponseWriter: c.Writer}
		c.Writer = writer
		start := time.Now()

		c.Next()

		status := writer.ResponseWriter.Status()
		if status < 400 || status > 599 {
			return
		}
		// 渠道侧错误已由 ProcessChannelError 记录，避免重复
		if c.GetBool("error_log_recorded") {
			return
		}
		if c.Request == nil || c.Request.URL == nil {
			return
		}

		content := extractErrorMessage(writer.body.Bytes())
		if content == "" {
			content = http.StatusText(status)
		}
		other := model.NewLogOther()
		other.SetPublic("request_path", c.Request.URL.Path)
		other.SetPublic("status_code", status)
		other.SetPublic("error_source", "middleware")
		if strings.HasPrefix(content, "[") || strings.HasPrefix(content, "{") {
			content = common.LocalLogPreview(content)
		}

		useTimeSeconds := int(time.Since(start).Seconds())
		model.RecordErrorLog(c, c.GetInt("id"), c.GetInt("channel_id"),
			c.GetString("original_model"), c.GetString("token_name"),
			content, c.GetInt("token_id"), useTimeSeconds, false,
			c.GetString("group"), other)
	}
}

func hasCredential(c *gin.Context) bool {
	if c.GetHeader("Authorization") != "" || c.GetHeader("x-api-key") != "" {
		return true
	}
	if c.GetHeader("x-goog-api-key") != "" || c.Query("key") != "" {
		return true
	}
	return false
}

// extractErrorMessage 从标准错误响应体里抽出 message，抽不到就返回截断后的原文
func extractErrorMessage(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	var payload struct {
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
			Code    any    `json:"code"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		if payload.Error.Message != "" {
			return payload.Error.Message
		}
		if payload.Message != "" {
			return payload.Message
		}
	}
	text := strings.TrimSpace(string(body))
	if len(text) > 500 {
		text = text[:500]
	}
	return text
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Megaphone } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import type { AnnouncementItem } from '@/features/dashboard/types'
import { getAnnouncementKey } from '@/hooks/use-notifications'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/stores/notification-store'

import { PanelWrapper } from '../ui/panel-wrapper'
import { AnnouncementDetailModal } from './announcement-detail-dialog'

const AnnouncementStatusDot = memo(function AnnouncementStatusDot(props: {
  type?: string
}) {
  return (
    <span
      className={cn(
        'mt-1.5 inline-block size-2 shrink-0 rounded-full',
        getAnnouncementColorClass(props.type)
      )}
    />
  )
})

export function AnnouncementsPanel() {
  const { t } = useTranslation()
  const { items: list, loading } = useAnnouncements()
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementItem | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const markAnnouncementsRead = useNotificationStore(
    (state) => state.markAnnouncementsRead
  )
  const isAnnouncementRead = useNotificationStore(
    (state) => state.isAnnouncementRead
  )

  // 未读公告自动弹窗：进入概览时把最新一条未读公告推到用户面前，关闭即视为已读
  const unreadList = useMemo(
    () =>
      list.filter(
        (item) =>
          !isAnnouncementRead(
            getAnnouncementKey(item as unknown as Record<string, unknown>)
          )
      ),
    [list, isAnnouncementRead]
  )
  const autoOpenedRef = useRef(false)
  const [unreadQueue, setUnreadQueue] = useState<AnnouncementItem[]>([])
  const [queueIndex, setQueueIndex] = useState(0)

  const markRead = (item: AnnouncementItem | null) => {
    if (!item) return
    markAnnouncementsRead([
      getAnnouncementKey(item as unknown as Record<string, unknown>),
    ])
  }

  useEffect(() => {
    if (autoOpenedRef.current || loading || unreadList.length === 0) return
    autoOpenedRef.current = true
    setUnreadQueue(unreadList)
    setQueueIndex(0)
    setSelectedAnnouncement(unreadList[0])
    setIsDialogOpen(true)
  }, [loading, unreadList])

  const handleAnnouncementClick = (item: AnnouncementItem) => {
    setUnreadQueue([])
    setQueueIndex(0)
    setSelectedAnnouncement(item)
    setIsDialogOpen(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open)
    if (open) return
    markRead(selectedAnnouncement)
    setUnreadQueue([])
  }

  const handleNextUnread = () => {
    const nextIndex = queueIndex + 1
    if (nextIndex >= unreadQueue.length) return
    markRead(unreadQueue[queueIndex])
    setQueueIndex(nextIndex)
    setSelectedAnnouncement(unreadQueue[nextIndex])
  }

  const remainingUnread = Math.max(0, unreadQueue.length - queueIndex - 1)

  return (
    <PanelWrapper
      title={
        <span className='flex items-center gap-2'>
          <IconBadge tone='warning' size='sm'>
            <Megaphone />
          </IconBadge>
          {t('Announcements')}
        </span>
      }
      description={t('Latest platform updates and notices')}
      loading={loading}
      empty={!list.length}
      emptyMessage={t('No announcements at this time')}
      height='h-72'
      contentClassName='p-0'
    >
      <ScrollArea className='h-72'>
        <div>
          {list.map((item: AnnouncementItem, idx: number) => {
            const key = item.id ?? `announcement-${idx}`
            return (
              <button
                key={key}
                type='button'
                onClick={() => handleAnnouncementClick(item)}
                className={cn(
                  'group hover:bg-muted/40 w-full px-3 py-3 text-left transition-colors sm:px-5 sm:py-3.5',
                  idx < list.length - 1 && 'border-border/60 border-b'
                )}
              >
                <div className='flex items-start gap-2.5'>
                  <AnnouncementStatusDot type={item.type} />
                  <div className='flex min-w-0 flex-1 flex-col gap-1'>
                    <p className='line-clamp-1 text-sm font-medium'>
                      {getPreviewText(item.content)}
                    </p>
                    <div className='flex items-center justify-between'>
                      {item.publishDate && (
                        <time className='text-muted-foreground/60 text-xs'>
                          {formatDateTimeObject(new Date(item.publishDate))}
                        </time>
                      )}
                      <span className='text-muted-foreground/40 text-xs opacity-0 transition-opacity group-hover:opacity-100'>
                        {t('Click for details')}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>

      <AnnouncementDetailModal
        open={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
        announcement={selectedAnnouncement}
        footer={
          remainingUnread > 0 ? (
            <div className='flex w-full items-center justify-between gap-2'>
              <span className='text-muted-foreground text-xs'>
                {t('Announcement Unread Remaining', { count: remainingUnread })}
              </span>
              <Button
                size='sm'
                variant='outline'
                onClick={handleNextUnread}
              >
                {t('Announcement Next Unread')}
              </Button>
            </div>
          ) : undefined
        }
      />
    </PanelWrapper>
  )
}

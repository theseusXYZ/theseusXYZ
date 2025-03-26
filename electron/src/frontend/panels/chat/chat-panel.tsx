import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import ChatHeader from './components/chat-header'
import { useScrollAnchor } from '@/panels/chat/lib/hooks/chat.use-scroll-anchor'
import ChatMessages from './components/messages/chat-messages'
import ChatInputField from './components/input/chat-input-field'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import { Skeleton } from '@/components/ui/skeleton'
import type { Message } from '@/lib/types'
import { useAtomValue } from 'jotai'
import { checkpointTrackerAtom } from '@/panels/timeline/lib'
interface ChatProps {
    sessionId: string | null
    viewOnly?: boolean
    headerIcon?: JSX.Element
    loading?: boolean
}

export default function Chat({
    sessionId,
    viewOnly = false,
    headerIcon,
    loading = false,
}: ChatProps) {
    const { scrollRef, visibilityRef, isAtBottom, scrollToBottom } =
        useScrollAnchor()
    const checkpointTracker = useAtomValue(checkpointTrackerAtom)
    const lastUpdateTimeRef = useRef(0)
    const [localCheckpointTracker, setLocalCheckpointTracker] = useState('')

    useEffect(() => {
        const newCheckpoint = checkpointTracker?.selected?.checkpoint_id
        // const currentTime = Date.now()
        // if (localCheckpointTracker !== newCheckpoint) {
        //     const delay = Math.max(
        //         0,
        //         3000 - (currentTime - lastUpdateTimeRef.current)
        //     )
        //     const timeoutId = setTimeout(() => {
        //         setLocalCheckpointTracker(newCheckpoint ?? '')
        //         lastUpdateTimeRef.current = Date.now()
        //     }, delay)
        //     return () => clearTimeout(timeoutId)
        // }
        setLocalCheckpointTracker(newCheckpoint ?? '')
    }, [checkpointTracker, localCheckpointTracker])

    const state = SessionMachineContext.useSelector(state => state)
    const eventState = SessionMachineContext.useSelector(
        state => state.context.serverEventContext
    )

    const isPaused = SessionMachineContext.useActorRef()
        .getSnapshot()
        .matches('paused')

    let messages: Message[] = eventState.messages
    if (
        messages.length > 1 &&
        messages[0].type === 'task' &&
        messages[1].type === 'thought'
    ) {
        messages = messages.slice(2)
    }

    const previousMessagesLengthRef = useRef(messages.length)
    useEffect(() => {
        if (messages.length > previousMessagesLengthRef.current) {
            scrollToBottom()
        }
        previousMessagesLengthRef.current = messages.length
    }, [messages.length, scrollToBottom])

    let status = 'Initializing...'
    if (state.matches('running')) {
        status = eventState.modelLoading
            ? 'Waiting for theseus...'
            : eventState.userRequest
            ? 'Type your message:'
            : 'Interrupt:'
    }

    return (
        <div className="rounded-lg h-full w-full flex flex-col flex-2">
            <ChatHeader sessionId={sessionId} headerIcon={headerIcon} />
            <div className="flex-1 overflow-y-auto">
                <div
                    className="flex flex-col flex-2 relative h-full overflow-y-auto"
                    ref={scrollRef}
                >
                    <div className="flex-1">
                        {!state.matches('running') &&
                        !state.matches('paused') ? (
                            <LoadingSkeleton />
                        ) : (
                            <ChatMessages
                                messages={messages}
                                spinning={eventState.modelLoading}
                                paused={isPaused}
                                checkpointTracker={localCheckpointTracker}
                                setCheckpointTracker={setLocalCheckpointTracker}
                            />
                        )}
                        <div className="h-px w-full" ref={visibilityRef}></div>
                    </div>
                    <div className="sticky bottom-0 w-full">
                        <div className="bg-fade-bottom-to-top pt-20 overflow-hidden rounded-xl -mb-[1px]">
                            <ChatInputField
                                isAtBottom={isAtBottom}
                                scrollToBottom={scrollToBottom}
                                viewOnly={viewOnly}
                                eventContext={eventState}
                                loading={!state.can({ type: 'session.toggle' })}
                                sessionId={sessionId}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

const LoadingSkeleton = () => {
    return (
        <>
            <div className="flex flex-col flex-2 relative h-full overflow-y-auto mx-6 mt-6 mr-10">
                <div className="flex-1">
                    <div className="mb-8">
                        <div className="flex gap-5">
                            <Skeleton className="w-[32px] h-[32px]" />
                            <div className="w-full flex flex-col justify-between">
                                <Skeleton className="w-full h-[12px] rounded-[4px]" />
                                <Skeleton className="w-2/3 h-[12px] rounded-[4px] bg-skeleton bg-opacity-80" />
                            </div>
                        </div>
                    </div>
                    <div className="mb-8">
                        <div className="flex gap-5">
                            <Skeleton className="w-[32px] h-[32px]" />
                            <div className="w-full flex flex-col justify-between">
                                <Skeleton className="w-full h-[12px] rounded-[4px]" />
                                <Skeleton className="w-1/3 h-[12px] rounded-[4px] bg-skeleton bg-opacity-80" />
                            </div>
                        </div>
                    </div>
                    <div className="mb-8">
                        <div className="flex gap-5">
                            <Skeleton className="w-[32px] h-[32px]" />
                            <div className="w-full flex flex-col justify-between">
                                <Skeleton className="w-full h-[12px] rounded-[4px]" />
                                <Skeleton className="w-4/5 h-[12px] rounded-[4px] bg-skeleton bg-opacity-80" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

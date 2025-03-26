import React, {
    useRef,
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
    useMemo,
} from 'react'
import {
    UserMessage,
    BotMessage,
    ToolResponseMessage,
    ThoughtMessage,
    SpinnerMessage,
    RateLimitWarning,
    ErrorMessage,
} from '@/panels/chat/components/messages/chat.message-variants'
import { NotebookPen } from 'lucide-react'
import type { Message } from '@/lib/types'
import { useScrollAnchor } from '../../lib/hooks/chat.use-scroll-anchor'
import { cn } from '@/lib/utils'

interface ScrollPoint {
    hash: string
    index: number
}

interface ChatMessagesProps {
    messages: Message[]
    spinning: boolean
    paused: boolean
    setCheckpointTracker: (value: string) => void
    checkpointTracker: string
}

const ChatMessages: React.FC<ChatMessagesProps> = ({
    messages,
    spinning,
    paused,
    setCheckpointTracker,
    checkpointTracker,
}) => {
    const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const [scrollToCheckpointHash, setScrollToCheckpointHash] = useState<
        ScrollPoint | undefined
    >(undefined)
    const prevCheckpointIdRef = useRef<string | undefined>(undefined)

    const scrollToMessage = useCallback((checkpointHash: string) => {
        const messageElement = messageRefs.current.get(checkpointHash)
        if (messageElement) {
            messageElement.scrollIntoView({
                behavior: 'instant',
                block: 'start',
            })
        }
    }, [])

    useLayoutEffect(() => {
        if (
            checkpointTracker
            // && checkpointTracker !== prevCheckpointIdRef.current
        ) {
            const index = messages.findIndex(
                message =>
                    message.type === 'checkpoint' &&
                    message.text === checkpointTracker
            )
            scrollToMessage(checkpointTracker)
            setScrollToCheckpointHash({ hash: checkpointTracker, index })

            prevCheckpointIdRef.current = checkpointTracker
        } else {
            if (!checkpointTracker) {
                setScrollToCheckpointHash(undefined)
            }
        }
    }, [checkpointTracker, messages, scrollToMessage])

    return (
        <div className="relative px-6 mt-6">
            {messages.map((message, index) => (
                <MemoizedDisplayedChatMessage
                    key={`${index}-${message.type}-${message.text}`}
                    message={message}
                    className={
                        scrollToCheckpointHash?.index !== undefined &&
                        index > scrollToCheckpointHash.index
                            ? 'animate-pulse3'
                            : ''
                    }
                    index={index}
                    setRef={el => {
                        if (el && message.type === 'checkpoint') {
                            messageRefs.current.set(message.text, el)
                        }
                    }}
                />
            ))}
            {spinning && <SpinnerMessage paused={paused} />}
        </div>
    )
}
const MemoizedDisplayedChatMessage = React.memo(
    ({
        className,
        message,
        index,
        setRef,
    }: {
        className?: string
        message: Message
        index: number
        setRef: (el: HTMLDivElement | null) => void
    }) => {
        return (
            <div ref={setRef} className={cn('mb-8', className)}>
                {message.type === 'agent' ? (
                    <BotMessage content={message.text} />
                ) : // ) : message.type === 'checkpoint' ? (
                //     <p>{message.text}</p>
                message.type === 'thought' ? (
                    <ThoughtMessage content={message.text} />
                ) : message.type === 'command' ? (
                    <ChatTypeWrapper type="Command">
                        {message.text}
                    </ChatTypeWrapper>
                ) : message.type === 'rateLimit' ? (
                    <RateLimitWarning className="text-gray-400" />
                ) : message.type === 'tool' ? (
                    <ToolResponseMessage
                        className="text-gray-400"
                        content={message.text}
                        index={index}
                    />
                ) : message.type === 'user' ? (
                    <UserMessage>{message.text}</UserMessage>
                ) : message.type === 'error' ? (
                    <ErrorMessage
                        className={index === 1 ? '' : 'ml-[49px]'}
                        content={message.text}
                    />
                ) : null}
            </div>
        )
    }
)

const ChatTypeWrapper = React.memo(
    ({
        type,
        children,
        className,
    }: {
        type: string
        children: string | JSX.Element
        className?: string
    }) => {
        return <p className={className}>{children}</p>
    }
)

export default ChatMessages

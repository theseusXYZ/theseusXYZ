import { useEffect, useState, useRef, RefObject } from 'react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
    PopoverAnchor,
    PopoverClose,
} from '@/components/ui/popover'
import { Undo2 } from 'lucide-react'
import { useAtom } from 'jotai'
import {
    StepType,
    checkpointTrackerAtom,
    useCheckpointMessageMappings,
} from '../lib'
import { CheckpointTracker } from '@/lib/types'
import SubStep from './substep'

const Step: React.FC<{
    step: StepType
    index: number
    activeStep: number
    setSubStepFinished: (value: boolean) => void
    stepsLength: number
    animateDemo: boolean
    hasCommits: boolean
    expanded: boolean
    setExpanded: (value: boolean) => void
    selectedRevertStep: number | null
    setSelectedRevertStep: (value: number | null) => void
    sessionActorRef: any
    animationKey: number
    setAnimationKey: (value: number) => void
}> = ({
    step,
    index,
    activeStep,
    setSubStepFinished,
    stepsLength,
    animateDemo,
    hasCommits,
    expanded,
    setExpanded,
    selectedRevertStep,
    setSelectedRevertStep,
    sessionActorRef,
    animationKey,
    setAnimationKey,
}) => {
    const isPulsing = selectedRevertStep !== null && index > selectedRevertStep
    const lineBeforeShouldPulse =
        selectedRevertStep !== null && index === selectedRevertStep
    const [subStepActiveIndex, setSubStepActiveIndex] = useState(
        animateDemo ? -1 : step.subSteps.length - 1
    )
    const [connectorHeight, setConnectorHeight] = useState(0)
    const contentRef: RefObject<HTMLDivElement> = useRef(null)
    const pathRef: RefObject<SVGPathElement> = useRef(null)
    const [checkpointTracker, setCheckpointTracker] =
        useAtom<CheckpointTracker | null>(checkpointTrackerAtom)
    const PADDING_OFFSET = 10
    const CURVE_SVG_WIDTH = 40 + PADDING_OFFSET
    const CURVE_SVG_HEIGHT_OFFSET = 50 // Dynamic height not really working yet... this is needed if there's no subtitle
    const CURVE_SVG_ANIMATION_DURATION = 1000

    const SUBITEM_LEFT_MARGIN = 50 // Only change this if you change the padding of each substep item

    useEffect(() => {
        if (contentRef.current) {
            const totalHeight =
                contentRef.current.clientHeight + CURVE_SVG_HEIGHT_OFFSET
            setConnectorHeight(totalHeight)
        }
    }, [contentRef])

    // New effect to handle non-animated case
    useEffect(() => {
        if (!animateDemo) {
            setSubStepActiveIndex(step.subSteps.length - 1)
        }
    }, [animateDemo, step.subSteps.length])

    // Modify the isActive check to consider non-animated case
    const isActive = animateDemo ? index <= activeStep : true

    useEffect(() => {
        if (animateDemo && activeStep === index && step.subSteps.length > 0) {
            const interval = setInterval(() => {
                setSubStepActiveIndex(prevIndex => {
                    if (prevIndex < step.subSteps.length - 1) {
                        return prevIndex + 1
                    }
                    clearInterval(interval)
                    /**
                     * This setTimeout ensures setSubStepFinished is called after the state update
                        Or else you get the error:
                        Cannot update a component (`TimelinePanel`) while rendering a different component (`Step`). To locate the bad setState() call inside `Step`,
                     */
                    setTimeout(() => {
                        setSubStepFinished(true)
                    }, 0)
                    return prevIndex
                })
            }, 1000)
            return () => clearInterval(interval)
        } else if (activeStep === index) {
            setSubStepFinished(true)
        }
    }, [activeStep, index, setSubStepFinished, step.subSteps.length])

    useEffect(() => {
        if (pathRef.current) {
            const pathLength = pathRef.current.getTotalLength()
            pathRef.current.style.strokeDasharray = `${pathLength}`
            pathRef.current.style.strokeDashoffset = `${pathLength}`
            pathRef.current.getBoundingClientRect()
            pathRef.current.style.transition = `stroke-dashoffset ${CURVE_SVG_ANIMATION_DURATION}ms ease-in-out`
            pathRef.current.style.strokeDashoffset = '0'
        }
    }, [connectorHeight, subStepActiveIndex])

    const connectorPath = `
        M 12 0
        Q 12 ${connectorHeight / 2} ${CURVE_SVG_WIDTH} ${connectorHeight / 2}
    `
    const checkpointMessageMappings = useCheckpointMessageMappings()

    function handleRevertStep(step: StepType) {
        // Go back to the present
        if (checkpointTracker?.selected) {
            setCheckpointTracker({
                ...checkpointTracker,
                selected: null,
                consumeCommitMessage: checkpointMessageMappings.get(
                    checkpointTracker.selected.checkpoint_id
                ),
            })
            // scrollToBottom() // TODO: Not working rn, because need to wait for revert to finish, then scroll
        }

        sessionActorRef.send({
            type: 'session.revert',
            params: { checkpoint_id: step.checkpoint_id },
        })
    }

    const renderCircle = () => {
        const circle = (
            <div
                className={`z-10 flex items-center justify-center w-6 h-6 bg-white rounded-full ${
                    activeStep >= index ? 'opacity-100' : 'opacity-0'
                } transition-opacity duration-1000`}
            >
                {hasCommits && activeStep === index ? (
                    <div className="flex items-center justify-center relative">
                        <div className="w-3 h-3 bg-primary rounded-full animate-pulse-size-lg"></div>
                        <div className="absolute w-3 h-3 bg-primary rounded-full"></div>
                        {/* <div className="absolute w-6 h-6 bg-primary rounded-full opacity-40"></div> */}
                    </div>
                ) : (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                )}
            </div>
        )
        if (expanded) {
            return circle
        }
        return (
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger onClick={() => setExpanded(!expanded)}>
                        {circle}
                    </TooltipTrigger>
                    <TooltipContent side="right" align="end">
                        <p>{step.commit_message}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }

    function handleOpenChange(open: boolean) {
        if (open) {
            setAnimationKey((prevKey: number) => prevKey + 1)
            setSelectedRevertStep(index)
            if (checkpointTracker) {
                setCheckpointTracker({
                    ...checkpointTracker,
                    selected: step,
                })
            } else {
                console.log('Failed to get existing checkpoint tracker')
            }
        } else {
        }
    }

    const renderTextAndSubsteps = () => {
        return (
            <>
                <PopoverTrigger asChild>
                    <div
                        className={`flex flex-col hover:opacity-90 hover:cursor-pointer w-full`}
                    >
                        <div ref={contentRef} className="flex flex-col">
                            <PopoverAnchor asChild>
                                <span
                                    className={`text-white min-h-10 ${
                                        expanded ? 'line-clamp-2' : ''
                                    }`}
                                >
                                    {expanded && step.commit_message}
                                </span>
                            </PopoverAnchor>
                            <span className="mt-1 text-gray-400 whitespace-nowrap">
                                {step.subtitle}
                            </span>
                        </div>
                        {activeStep >= index && step.subSteps.length > 0 && (
                            <div
                                style={{
                                    marginLeft: `calc(${CURVE_SVG_WIDTH}px - ${SUBITEM_LEFT_MARGIN}px)`,
                                }}
                                className="mt-3"
                            >
                                {step.subSteps.map((subStep, subIndex) => (
                                    <SubStep
                                        key={subStep.commit_hash}
                                        subStep={subStep}
                                        showLine={
                                            subIndex < step.subSteps.length - 1
                                        }
                                        active={subStepActiveIndex >= subIndex}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    alignOffset={7}
                    side="right"
                    sideOffset={16}
                    className="flex gap-2 items-center pl-2 pr-3 py-2 w-auto border-primary bg-night hover:bg-batman smooth-hover"
                    asChild
                >
                    <PopoverClose asChild>
                        <button onClick={() => handleRevertStep(step)}>
                            <Undo2 size={16} />
                            Revert to this commit
                        </button>
                    </PopoverClose>
                </PopoverContent>
            </>
        )
    }

    return (
        <Popover onOpenChange={handleOpenChange}>
            <div
                key={isPulsing ? animationKey : undefined}
                className={`flex flex-row ${isPulsing ? 'animate-pulse2' : ''}`}
            >
                <div className="relative flex-start">
                    {renderCircle()}
                    {/* This is the line */}
                    {index < stepsLength - 1 && (
                        <div
                            key={`line-${animationKey}`}
                            className={`absolute w-px ${
                                activeStep > index
                                    ? 'h-[calc(100%-1.5rem)]'
                                    : 'h-0'
                            } bg-white top-6 left-1/2 transform -translate-x-1/2 transition-all
                         ${
                             lineBeforeShouldPulse
                                 ? 'animate-pulse2 duration-2000'
                                 : 'duration-1000'
                         }`}
                        ></div>
                    )}
                    {step.subSteps.length > 0 && subStepActiveIndex >= 0 && (
                        <svg
                            width={CURVE_SVG_WIDTH}
                            height={connectorHeight}
                            className="absolute"
                        >
                            <path
                                ref={pathRef}
                                d={connectorPath}
                                className="stroke-white"
                                fill="transparent"
                                strokeWidth="1.5"
                            />
                        </svg>
                    )}
                </div>
                <div
                    className={`flex items-center ml-5 mb-3 ${
                        !animateDemo || activeStep >= index
                            ? 'opacity-100'
                            : 'opacity-0'
                    } transition-opacity duration-1000 ${
                        animateDemo ? 'delay-800' : ''
                    }`}
                >
                    {renderTextAndSubsteps()}
                </div>
            </div>
        </Popover>
    )
}

export default Step

// Server session machine

// Context object contains:
// 1. host
// 2.

// root states:
// launch (created, started, but not running)
// setup server,
// server running,
// spawn session
// shutdown
import axios from 'axios'
import {
    fromTransition,
    fromCallback,
    EventObject,
    sendTo,
    enqueueActions,
    setup,
    raise,
    assign,
    fromPromise,
    emit,
    log,
    // createActor
} from 'xstate'
import type { Message } from '@/lib/types'
import { getGitSettings } from '@/lib/app-settings'

type ServerEvent = {
    type:
        | 'session.reset'
        | 'ModelResponse'
        | 'ToolResponse'
        | 'Task'
        | 'Interrupt'
        | 'UserRequest'
        | 'Stop'
        | 'ModelRequest'
        | 'ToolRequest'
        | 'Error'
        | 'UserResponse'
        | 'ShellRequest'
        | 'ShellResponse'
        | 'RateLimit'
        | 'GitEvent'
        | 'GitError'
        | 'GitResolve'
        | 'GitInit'
        | 'Checkpoint'
        | 'GitAskUser'
        | 'GitCorrupted'
        | 'GitCorruptedResolved'
        | 'GitMergeResult'
    content: any
    identifier: string | null
}

type ServerEventContext = {
    messages: Message[]
    ended: boolean
    modelLoading: boolean
    toolMessage: string
    userRequest: boolean
    gitData: {
        base_commit: {
            message: string
            hash: string
        } | null
        commits: {
            message: string
            hash: string
        }[]
    }
    gitError: string | null
    gitInit: string | null
    gitMessage: string | null
    gitCorrupted: boolean
    gitMergeResult: {
        success: boolean
        message: string
    } | null
    status: string | null //'idle' | 'thinking' | 'executing' | 'waiting_for_user'
}

export const eventHandlingLogic = fromTransition(
    (state: ServerEventContext, event: ServerEvent) => {
        // console.log('event', event)
        switch (event.type) {
            case 'session.reset': {
                return {
                    ...state,
                    messages: [],
                    ended: false,
                    modelLoading: false,
                    toolMessage: '',
                    userRequest: false,
                    gitData: {
                        base_commit: null,
                        commits: [],
                    },
                    gitMessage: null,
                    gitCorrupted: false,
                    gitMergeResult: null,
                }
            }
            case 'Stop': {
                return { ...state, ended: true }
            }
            case 'ModelRequest': {
                return { ...state, modelLoading: true, status: 'thinking' }
            }
            case 'ModelResponse': {
                const content = JSON.parse(event.content)
                return {
                    ...state,
                    status: 'idle',
                    modelLoading: false,
                    messages: [
                        ...state.messages,
                        { text: content.thought, type: 'thought' } as Message,
                    ],
                }
            }
            case 'ShellRequest': {
                return {
                    ...state,
                    messages: [
                        ...state.messages,
                        {
                            text: event.content,
                            type: 'shellCommand',
                        } as Message,
                    ],
                }
            }
            case 'ShellResponse': {
                return {
                    ...state,
                    messages: [
                        ...state.messages,
                        {
                            text: event.content,
                            type: 'shellResponse',
                        } as Message,
                    ],
                }
            }
            case 'ToolRequest': {
                return {
                    ...state,
                    status: 'executing',
                    toolLoading: true,
                    toolMessage:
                        'Running command: ' + event.content.raw_command.trim(),
                }
            }
            case 'Checkpoint': {
                return {
                    ...state,
                    status: 'idle',
                    messages: [
                        ...state.messages,
                        { text: event.content, type: 'checkpoint' } as Message,
                    ],
                }
            }
            case 'ToolResponse': {
                let tool_message =
                    state.toolMessage + '|START_RESPONSE|' + event.content
                return {
                    ...state,
                    toolLoading: false,
                    toolMessage: '',
                    messages: [
                        ...state.messages,
                        { text: tool_message, type: 'tool' } as Message,
                    ],
                }
            }
            case 'Task': {
                return {
                    ...state,
                    messages: [
                        ...state.messages,
                        { text: event.content, type: 'task' } as Message,
                    ],
                }
            }
            case 'Interrupt': {
                return {
                    ...state,
                    messages: [
                        ...state.messages,
                        { text: event.content, type: 'user' } as Message,
                    ],
                }
            }
            case 'UserRequest': {
                return {
                    ...state,
                    status: 'waiting_for_user',
                    userRequest: true,
                    messages: [
                        ...state.messages,
                        { text: event.content, type: 'agent' } as Message,
                    ],
                }
            }
            case 'UserResponse': {
                return {
                    ...state,
                    userRequest: false,
                    messages: [
                        ...state.messages,
                        { text: event.content, type: 'user' } as Message,
                    ],
                }
            }
            case 'RateLimit': {
                return {
                    ...state,
                    messages: [
                        ...state.messages,
                        { text: event.content, type: 'rateLimit' } as Message,
                    ],
                    modelLoading: false,
                }
            }
            case 'Error': {
                console.error(event.content)
                return {
                    ...state,
                    messages: [
                        ...state.messages,
                        { text: event.content, type: 'error' } as Message,
                    ],
                    modelLoading: false,
                }
            }
            case 'GitEvent': {
                const commit = {
                    message: event.content?.message?.trim(),
                    hash: event.content?.commit_hash,
                }
                if (event.content.type === 'base_commit') {
                    return {
                        ...state,
                        gitData: {
                            base_commit: commit,
                            commits: [commit],
                        },
                    }
                } else if (event.content.type === 'commit') {
                    return {
                        ...state,
                        gitData: {
                            base_commit: state.gitData.base_commit,
                            commits: [...state.gitData.commits, commit],
                        },
                    }
                } else if (event.content.type === 'revert') {
                    return {
                        ...state,
                        gitData: {
                            base_commit: commit,
                            commits: state.gitData.commits.slice(
                                0,
                                state.gitData.commits.indexOf(
                                    event.content.commit_to_go_to
                                ) + 1
                            ),
                        },
                    }
                } else {
                    return state
                }
            }
            case 'GitError': {
                return {
                    ...state,
                    gitError: event.content ?? null,
                }
            }
            case 'GitResolve': {
                return {
                    ...state,
                    gitError: null,
                    gitMessage: null,
                }
            }
            case 'GitAskUser':
                return {
                    ...state,
                    gitMessage: event.content ?? null,
                }
            case 'GitInit': {
                return {
                    ...state,
                    gitInit: event.content ?? null,
                }
            }
            case 'GitCorrupted': {
                return {
                    ...state,
                    gitCorrupted: true,
                }
            }
            case 'GitCorruptedResolved': {
                return {
                    ...state,
                    gitCorrupted: false,
                }
            }
            case 'GitMergeResult': {
                return {
                    ...state,
                    gitMergeResult: event.content,
                }
            }
            case 'GitMergeResolve': {
                return {
                    ...state,
                    gitMergeResult: null,
                }
            }
            default: {
                return state
            }
        }
    },
    {
        messages: [],
        ended: false,
        modelLoading: false,
        toolMessage: '',
        userRequest: false,
        gitData: {
            base_commit: null,
            commits: [],
        },
        gitError: null,
        gitInit: null,
        gitMessage: null,
        gitMergeResult: null,
        gitCorrupted: false,
        status: 'idle',
    }
)

export const eventSourceActor = fromCallback<
    EventObject,
    { host: string; name: string }
>(({ input, receive, sendBack }) => {
    let eventStream: EventSource | null = null
    const eventHandler = ({ data }: { data: any }) => {
        sendBack({ type: 'serverEvent', payload: JSON.parse(data) })
    }

    receive((event: any) => {
        if (event.type === 'startStream') {
            eventStream = new EventSource(
                `${input.host}/sessions/${input.name}/events/stream`
            )

            eventStream.addEventListener('message', eventHandler)
        }
        if (event.type === 'reset') {
            eventStream?.removeEventListener('message', eventHandler)
            eventStream?.close()
            eventStream = new EventSource(
                `${input.host}/sessions/${input.name}/events/stream`
            )
            eventStream.addEventListener('message', eventHandler)
        }
        if (event.type === 'stopStream') {
            eventStream?.removeEventListener('message', eventHandler)
        }
    })

    return () => {
        eventStream?.removeEventListener('message', eventHandler)
        eventStream?.close()
    }
})

export const fetchSessionCallbackActor = fromCallback<
    EventObject,
    { host: string; name: string }
>(({ input, receive, sendBack }) => {
    let interval: string | number | NodeJS.Timeout
    let state: any

    receive((event: any) => {
        if (event.type === 'startFetching') {
            interval = setInterval(async () => {
                const new_state = await fetchSessionState(
                    input.host,
                    input.name
                )
                if (new_state !== state) {
                    state = new_state
                    sendBack({ type: 'session.stateUpdate', payload: state })
                }
            }, 1000)
        }
        if (event.type === 'stopFetching') {
            clearInterval(interval)
        }
    })

    return () => {
        clearInterval(interval)
    }
})

const createSessionActor = fromPromise(
    async ({
        input,
    }: {
        input: { host: string; name: string; path: string; agentConfig: any }
    }) => {
        // sleep for 5 sec
        // await new Promise(resolve => setTimeout(resolve, 5000));
        try {
            const { versioning_type } = await getGitSettings()
            const response = await axios.post(
                `${input.host}/sessions/${input?.name}`,
                {
                    versioning_type,
                    ...input.agentConfig,
                },
                {
                    params: {
                        // session: input?.name,
                        path: input?.path,
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            )
            return response
        } catch (e) {
            console.log(e)
            throw e
        }
    }
)

const loadEventsActor = fromPromise(
    async ({
        input,
    }: {
        input: { host: string; name: string; reset: boolean }
    }) => {
        try {
            const newEvents = (
                await axios.get(`${input?.host}/sessions/${input?.name}/events`)
            ).data
            return newEvents
        } catch (e) {
            console.log(e)
        }
    }
)

const startSessionActor = fromPromise(
    async ({
        input,
    }: {
        input: { host: string; name: string; api_key: string }
    }) => {
        const response = await axios.patch(
            `${input?.host}/sessions/${input?.name}/start`,
            {},
            {
                params: {
                    api_key: input.api_key,
                },
            }
        )

        // const events = (
        //     await axios.get(`${input?.host}/sessions/${input?.name}/events`)
        // ).data

        // const state = (
        //     await axios.get(`${input?.host}/sessions/${input?.name}/state`)
        // ).data

        return response
    }
)

const revertSessionActor = fromPromise(
    async ({
        input,
    }: {
        input: { host: string; name: string; checkpoint_id: number }
    }) => {
        console.log('reverting', input.checkpoint_id)
        const response = await axios.patch(
            `${input?.host}/sessions/${input?.name}/revert?checkpoint_id=${input.checkpoint_id}`
        )
        return response
    }
)

type SendEventType = {
    type: string
    params: {
        serverEventType: string
        content: any
    }
}

const sendEvent = async ({
    input,
}: {
    input: { host: string; name: string; event: SendEventType }
}) => {
    const response = await axios.post(
        `${input.host}/sessions/${input.name}/event`,
        {
            type: input.event.params.serverEventType,
            content: input.event.params.content,
            producer: 'user',
            consumer: 'agent',
        }
    )
    return response.data
}

const sendMessage = async ({
    host,
    name,
    message,
    userResponse,
}: {
    host: string
    name: string
    message: string
    userResponse: boolean
}) => {
    if (userResponse) {
        await axios.post(
            `${host}/sessions/${name}/response`,
            {},
            {
                params: {
                    response: message,
                },
            }
        )
    } else {
        await axios.post(`${host}/sessions/${name}/event`, {
            type: 'Interrupt',
            content: message,
            producer: 'user',
            consumer: 'agent',
        })
    }
}

export const fetchSessionState = async (host: string, sessionId: string) => {
    const { data } = await axios.get(
        `${host}/sessions/${encodeURIComponent(sessionId)}/config`
    )
    return data
}

const EVENTSOURCE_ACTOR_ID = 'ServerEventSource'
const EVENTHANDLER_ACTOR_ID = 'ServerEventHandler'

export const newSessionMachine = setup({
    types: {
        context: {} as {
            reset: boolean
            host: string
            name: string
            path: string
            serverEventContext: ServerEventContext
            agentConfig: any
            sessionConfig: any
            healthcheckRetry: number
        },
    },
    actors: {
        fetchSessionCallbackActor: fetchSessionCallbackActor,
        createSession: createSessionActor,
        loadEvents: loadEventsActor,
        startSession: startSessionActor,
        eventSourceActor: eventSourceActor,
        eventHandlingLogic: eventHandlingLogic,
        // sendEventActor: sendEventActor,
        checkServer: fromPromise(
            async ({ input }: { input: { host: string } }) => {
                const response = await axios.get(`${input?.host}/`)
                return response
            }
        ),
        checkSession: fromPromise(
            async ({ input }: { input: { host: string; name: string } }) => {
                const response = await axios.get(`${input?.host}/sessions`)

                for (let i = 0; i < response.data.length; i++) {
                    if (response.data[i].name === input.name) {
                        return response.data[i].name
                    }
                }
                throw new Error('Session not found')
            }
        ),
        pauseSession: fromPromise(
            async ({ input }: { input: { host: string; name: string } }) => {
                const response = await axios.patch(
                    `${input?.host}/sessions/${input?.name}/pause`
                )
                return response
            }
        ),
        resetSession: fromPromise(
            async ({ input }: { input: { host: string; name: string } }) => {
                // pause session first
                await axios.patch(
                    `${input?.host}/sessions/${input?.name}/pause`
                )
                const response = await axios.patch(
                    `${input?.host}/sessions/${input?.name}/reset`
                )

                // const state = (
                //     await axios.get(
                //         `${input?.host}/sessions/${input?.name}/state`
                //     )
                // ).data

                return response
            }
        ),
        deleteSession: fromPromise(
            async ({ input }: { input: { host: string; name: string } }) => {
                // Perform teardown (backend endpoint)
                await axios.get(
                    `${input?.host}/sessions/${input?.name}/teardown`
                )
                // Delete session
                const response = await axios.delete(
                    `${input?.host}/sessions/${input?.name}`
                )
                return response
            }
        ),
        revertSession: revertSessionActor,
        resumeSession: fromPromise(
            async ({ input }: { input: { host: string; name: string } }) => {
                const response = await axios.patch(
                    `${input?.host}/sessions/${input?.name}/resume`
                )
                return response
            }
        ),
    },
}).createMachine({
    context: ({ input }: { input: any }) => ({
        reset: input.reset,
        host: input.host,
        name: input.name,
        path: '',
        agentConfig: undefined,
        sessionConfig: undefined,
        serverEventContext: {
            messages: [],
            ended: false,
            modelLoading: false,
            toolMessage: '',
            userRequest: false,
            gitData: {
                base_commit: null,
                commits: [],
            },
            gitMergeResult: null,
            gitMessage: null,
            gitError: null,
            gitInit: null,
            gitCorrupted: false,
        },
        healthcheckRetry: 0,
    }),
    invoke: [
        {
            id: 'fetchSessionCallbackActor',
            src: 'fetchSessionCallbackActor',
            input: ({ context: { host, name } }) => ({ host, name }),
        },
        {
            id: EVENTSOURCE_ACTOR_ID,
            src: 'eventSourceActor',
            input: ({ context: { host, name } }) => ({ host, name }),
            onDone: {
                actions: ({ event }) => {
                    // console.log("event", event)
                },
            },
        },
        {
            id: EVENTHANDLER_ACTOR_ID,
            src: 'eventHandlingLogic',
            input: ({ context: { host, name } }) => ({ host, name }),
            onSnapshot: {
                actions: [
                    assign({
                        serverEventContext: ({ event }) => {
                            return event.snapshot.context
                        },
                    }),
                    raise(({ event }) => {
                        if (event.snapshot.context.ended) {
                            return {
                                type: 'session.ended',
                            }
                        } else {
                            return {
                                type: 'randomcrap',
                            }
                        }
                    }),
                ],
            },
        },
    ],
    initial: 'setup',
    states: {
        setup: {
            initial: 'healthcheck',
            states: {
                healthcheck: {
                    initial: 'check',
                    states: {
                        check: {
                            invoke: {
                                id: 'checkServer',
                                src: 'checkServer',
                                input: ({ context: { host } }) => ({ host }),
                                onDone: {
                                    target: 'done',
                                },
                                onError: {
                                    target: 'retry',
                                    actions: assign(({ context }) => ({
                                        healthcheckRetry:
                                            context.healthcheckRetry + 1,
                                    })),
                                },
                            },
                        },
                        retry: {
                            after: {
                                5000: 'check',
                            },
                        },
                        done: {
                            type: 'final',
                        },
                    },
                    onDone: {
                        target: 'checkSession',
                    },
                },
                checkSession: {
                    invoke: {
                        id: 'checkSession',
                        src: 'checkSession',
                        input: ({ context: { host, name } }) => ({
                            host,
                            name,
                        }),
                        onDone: {
                            target: 'sessionExists',
                        },
                        onError: {
                            target: 'sessionDoesNotExist',
                        },
                    },
                },
                sessionDoesNotExist: {
                    on: {
                        'session.create': {
                            target: 'creating',
                            actions: [
                                () => console.log('Starting session'),
                                assign(({ context, event }) => ({
                                    ...context,
                                    agentConfig: event.payload.agentConfig,
                                    path: event.payload.path,
                                })),
                            ],
                        },
                    },
                },
                creating: {
                    initial: 'initial',
                    states: {
                        initial: {
                            invoke: {
                                id: 'createSession',
                                src: 'createSession',
                                input: ({
                                    context: { host, name, path, agentConfig },
                                }) => ({
                                    host,
                                    name,
                                    path,
                                    agentConfig,
                                }),
                                onDone: {
                                    target: 'sessionCreated',
                                },
                                onError: {
                                    target: 'retryCreateSession',
                                },
                            },
                        },
                        retryCreateSession: {
                            after: {
                                1000: 'initial',
                            },
                        },
                        sessionCreated: {
                            type: 'final',
                        },
                    },
                    onDone: {
                        target: 'sessionExists',
                    },
                },
                sessionExists: {
                    type: 'final',
                },
            },
            onDone: {
                target: 'sessionReady',
            },
        },
        deleting: {
            invoke: {
                id: 'deleteSession',
                src: 'deleteSession',
                input: ({ context: { host, name } }) => ({ host, name }),
                onDone: {
                    actions: [
                        sendTo(EVENTSOURCE_ACTOR_ID, ({ self }) => {
                            return {
                                type: 'stopStream',
                                sender: self,
                            }
                        }),
                    ],
                    target: 'setup',
                },
            },
        },
        sessionReady: {
            entry: [
                () => console.log('Session Ready!'),
                emit(({ context }) => ({
                    type: 'session.creationComplete',
                    name: context.name,
                })),
            ],
            on: {
                'session.delete': {
                    target: 'deleting',
                },
                'session.init': {
                    target: 'initializing',
                    actions: [
                        assign(({ event }) => ({
                            agentConfig: event.payload.agentConfig,
                        })),
                    ],
                },
            },
        },
        initializing: {
            entry: [
                () => console.log('Initializing session'),
                sendTo(EVENTHANDLER_ACTOR_ID, ({ self }) => {
                    return {
                        type: 'session.reset',
                        sender: self,
                    }
                }),
            ],
            invoke: {
                id: 'loadEvents',
                src: 'loadEvents',
                input: ({ context: { host, name, reset } }) => ({
                    host,
                    name,
                    reset,
                }),
                onDone: {
                    target: 'starting',
                    actions: enqueueActions(({ enqueue, event }) => {
                        for (let i = 0; i < event.output.length; i++) {
                            enqueue.sendTo(
                                EVENTHANDLER_ACTOR_ID,
                                event.output[i]
                            )
                        }
                    }),
                },
            },
            exit: [
                sendTo(EVENTSOURCE_ACTOR_ID, ({ self }) => {
                    return {
                        type: 'startStream',
                        sender: self,
                    }
                }),
                sendTo('fetchSessionCallbackActor', ({ self }) => {
                    return {
                        type: 'startFetching',
                        sender: self,
                    }
                }),
            ],
        },
        resetting: {
            exit: [
                () => console.log('Successfully reset'),
                sendTo(EVENTHANDLER_ACTOR_ID, ({ self }) => {
                    return {
                        type: 'session.reset',
                        sender: self,
                    }
                }),
            ],
            entry: () => console.log('Resetting session'),
            invoke: {
                id: 'resetSession',
                src: 'resetSession',
                input: ({ context: { host, name } }) => ({ host, name }),
                onDone: {
                    actions: [
                        sendTo(EVENTSOURCE_ACTOR_ID, ({ self }) => {
                            return {
                                type: 'stopStream',
                                sender: self,
                            }
                        }),
                    ],
                    target: 'initializing',
                },
            },

            // on: {
            //     "session.resume": {
            //         target: "starting"
            //     },
            //     "session.toggle": {
            //         target: "starting"
            //     },
            //     "session.reset": {
            //         target: "resetting"
            //     }
            // }
        },
        starting: {
            entry: () => console.log('Starting'),
            invoke: {
                id: 'startSession',
                src: 'startSession',
                input: ({ context: { host, name, agentConfig } }) => ({
                    host,
                    name,
                    api_key: agentConfig?.api_key,
                }),
                onDone: {
                    target: 'running',
                },
            },
            on: {
                'session.pause': {
                    target: 'paused',
                },
                'session.reset': {
                    target: 'resetting',
                },
                'session.toggle': {
                    target: 'paused',
                },
                'session.delete': {
                    target: 'deleting',
                },
            },
        },
        running: {
            on: {
                'session.pause': {
                    target: 'paused',
                },
                'session.sendMessage': {
                    target: 'running',
                    actions: [
                        ({ event, context }) => {
                            sendMessage({
                                host: context.host,
                                name: context.name,
                                message: event.message,
                                userResponse:
                                    context.serverEventContext.userRequest,
                            })
                        },
                        log('Sending message'),
                    ],
                },
                'session.toggle': {
                    target: 'paused',
                },
                'session.reset': {
                    target: 'resetting',
                },
                'session.delete': {
                    target: 'deleting',
                },
                serverEvent: {
                    target: 'running',
                    actions: sendTo('ServerEventHandler', ({ event }) => {
                        return event['payload']
                    }),
                    reenter: true,
                },
                'session.stateUpdate': {
                    target: 'running',
                    actions: assign(({ event }) => {
                        // console.log('stateUpdate', event.payload)
                        return {
                            sessionConfig: event.payload,
                        }
                    }),
                    reenter: true,
                },
                'session.revert': {
                    target: 'reverting',
                },
            },
        },
        resuming: {
            invoke: {
                id: 'resumeSession',
                src: 'resumeSession',
                input: ({ context: { host, name } }) => ({ host, name }),
                onDone: {
                    target: 'initializing',
                },
            },
        },
        paused: {
            invoke: {
                id: 'pauseSession',
                src: 'pauseSession',
                input: ({ context: { host, name } }) => ({ host, name }),
            },
            on: {
                'session.resume': {
                    target: 'starting',
                },
                'session.toggle': {
                    target: 'starting',
                },
                'session.reset': {
                    target: 'resetting',
                },
                'session.delete': {
                    target: 'deleting',
                },
                'session.revert': {
                    target: 'reverting',
                },
            },
        },
        reverting: {
            invoke: {
                id: 'revertSession',
                src: 'revertSession',
                input: ({ context: { host, name }, event }) => ({
                    host,
                    name,
                    checkpoint_id: event.params.checkpoint_id,
                }),
                onDone: {
                    actions: [
                        sendTo(EVENTSOURCE_ACTOR_ID, ({ self }) => {
                            return {
                                type: 'stopStream',
                                sender: self,
                            }
                        }),
                    ],
                    target: 'resuming',
                },
            },
        },
        stopped: {
            type: 'final',
        },
        error: {},
    },
    on: {
        'session.sendEvent': {
            actions: [
                ({ event, context }) => {
                    sendEvent({
                        input: {
                            host: context.host,
                            name: context.name,
                            event: event as SendEventType,
                        },
                    })
                },
            ],
        },
    },
})

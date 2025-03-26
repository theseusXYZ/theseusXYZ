import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SessionContextProviderComponent } from '@/contexts/session-machine-context'
import Landing from './landing'
import { useBackendUrl } from '@/contexts/backend-url-context'
import AtomLoader from '@/components/ui/atom-loader/atom-loader'
import { loadAppSettings } from '@/lib/app-settings'

const LOADING_TIMEOUT = 15000
const MINIMUM_LOADING_DURATION = 3000

export default function IndexPage() {
    const { backendUrl } = useBackendUrl()

    const [sessionMachineProps, setSessionMachineProps] = useState<{
        host: string
        name: string
    } | null>(null)
    const [smHealthCheckDone, setSmHealthCheckDone] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [startFadeIn, setStartFadeIn] = useState(false)

    useEffect(() => {
        setStartFadeIn(true)
        if (backendUrl) {
            setSessionMachineProps({ host: backendUrl, name: 'UI' })
        }
        // Check and set initial user settings (set only if not set before)
        loadAppSettings()
    }, [backendUrl])

    useEffect(() => {
        // Ensure the loader is displayed for at least 1.5 seconds
        const minimumLoadingTimer = setTimeout(() => {
            setIsLoading(false)
        }, MINIMUM_LOADING_DURATION)

        const loadingTimeoutTimer = setTimeout(() => {
            if (!smHealthCheckDone) {
                setError("Hm... theseus's taking a bit too long. Check logs?")
                setIsLoading(false)
            }
        }, LOADING_TIMEOUT)

        return () => {
            clearTimeout(minimumLoadingTimer)
            clearTimeout(loadingTimeoutTimer)
        }
    }, [smHealthCheckDone])

    const handleViewLogs = () => {
        // Use IPC to tell the main process to open the logs directory
        window.api.invoke('open-logs-directory')
    }

    if (error) {
        return (
            <div className="absolute top-0 left-0 w-full h-full bg-night z-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-2xl mb-4">{error}</p>
                    <Button onClick={handleViewLogs} className="px-4 py-2">
                        View Logs
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <>
            {sessionMachineProps && !isLoading && (
                <SessionContextProviderComponent
                    sessionMachineProps={sessionMachineProps}
                >
                    <button
                        className="absolute top-0 right-0 z-10 py-3 px-4 text-sm text-neutral-500 hover:text-white duration-200"
                        onClick={() =>
                            window.api.invoke('open-logs-directory', null)
                        }
                    >
                        Open Logs
                    </button>
                    <Landing
                        smHealthCheckDone={smHealthCheckDone}
                        setSmHealthCheckDone={setSmHealthCheckDone}
                    />
                </SessionContextProviderComponent>
            )}
            {!sessionMachineProps || isLoading || !smHealthCheckDone ? (
                <div
                    className={`absolute top-0 left-0 w-full h-full bg-night z-50 transition-opacity duration-1000 ${
                        startFadeIn ? 'opacity-100' : 'opacity-0'
                    }`}
                >
                    <div className="fixed left-[50%] top-[50%] grid translate-x-[-50%] translate-y-[-50%]">
                        <div className="flex items-center justify-center flex-col gap-10">
                            <AtomLoader size="lg" />
                            <p className="text-2xl">{`theseus's cleaning up his desk...`}</p>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    )
}

import './globals.css'
import { useEffect } from 'react'
import { Toaster } from '@/components/ui/toaster'
import AppHeader from '@/components/app-header'
import { BackendUrlProvider } from './contexts/backend-url-context'
import Page from './page'

function App() {
    useEffect(() => {
        const handleServerError = (error: unknown) => {
            console.error('Server Error:', error)
            // alert('Server Error: ' + error); // Display as a popup
        }

        // Set up the IPC receive listener
        window.api.receive('server-error', handleServerError)

        window.addEventListener('error', (event: ErrorEvent) => {
            const serializedError = {
                type: 'Error',
                name: event.error?.name || 'Error',
                message: event.message,
                stack: event.error?.stack,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            }
            window.api.send(
                'log-error',
                JSON.stringify(serializedError, null, 2)
            )
        })

        window.addEventListener(
            'unhandledrejection',
            (event: PromiseRejectionEvent) => {
                const serializedError = {
                    type: 'UnhandledPromiseRejection',
                    name: event.reason?.name || 'UnhandledPromiseRejection',
                    message: event.reason?.message || String(event.reason),
                    stack: event.reason?.stack,
                }
                window.api.send(
                    'log-error',
                    JSON.stringify(serializedError, null, 2)
                )
            }
        )

        // Clean up the listener on unmount
        return () => {
            window.api.removeAllListeners('server-error')
            window.api.removeAllListeners('error')
            window.api.removeAllListeners('unhandledrejection')
        }
    }, [])

    return (
        <div lang="en" className="dark h-full">
            <div className={` flex h-full flex-col`}>
                <div className="flex w-full h-full overflow-hidden">
                    <div className="relative w-full overflow-hidden bg-day transition-colors duration-200 dark:bg-night flex">
                        <BackendUrlProvider>
                            <AppHeader />
                            <main className="mt-[36px] flex flex-row w-full">
                                <Page />
                            </main>
                        </BackendUrlProvider>
                    </div>
                </div>
                <Toaster />
            </div>
        </div>
    )
}

export default App

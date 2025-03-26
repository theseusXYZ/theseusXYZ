import {
    List,
    PanelsTopLeft,
    PanelLeft,
    SquarePen,
    Settings,
    MessageCircleMore,
} from 'lucide-react'
import { useState } from 'react'
import Sidebar from '@/components/sidebar/sidebar'
import SelectProjectDirectoryModal from '@/components/modals/select-project-directory-modal'
import { useBackendUrl } from '@/contexts/backend-url-context'
// import Link from 'next/link'
// import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog'
// import SettingsModal from '@/components/modals/settings-modal'

const AppHeader = () => {
    // const pathname = usePathname()

    return (
        <>
            <header
                id="header"
                // className="flex w-full absolute top-0 px-3 items-center gap-1 pb-1 pt-12 h-14"
                className="flex w-full absolute top-0 px-3 items-center gap-1 pb-1 pt-4"
            >
                <div
                    id="header-drag-region"
                    className="absolute w-full h-full top-0 left-0"
                ></div>

                
                {/* <SelectProjectDirectoryModal
                    trigger={
                        <button
                            className={`no-drag ml-[8rem] p-2 ${expanded ? 'visible' : 'hidden'} z-10`}
                        >
                            <SquarePen size="1.4rem" className="no-drag text-primary" />
                        </button>
                    }
                    header={<h1 className="text-2xl font-bold mb-5">Create new chat</h1>}
                    backendUrl={backendUrl}
                /> */}
            </header>
        </>
    )
}

export default

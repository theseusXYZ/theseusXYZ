// import Link from 'next/link'
import { useComingSoonToast } from '@/components/ui/use-toast'

function SidebarItem({
    id,
    icon,
    text,
    active,
    route,
    alert,
    expanded,
    handleClick,
    content,
    comingSoon = false,
}: {
    id: string
    icon: JSX.Element
    text: string
    active: boolean
    route: string
    alert: boolean
    expanded: boolean
    handleClick: (id: string) => void
    content?: JSX.Element
    comingSoon?: boolean
}) {
    const toast = useComingSoonToast()
    return (
        <div
            className={`
        relative flex  my-1
        font-medium
        transition-colors group
        ${active && expanded ? 'border-l-2 border-primary' : ''}
    `}
        >
            {/* <Link href={route} className="flex"> */}
            <button
                onClick={() => {
                    if (comingSoon) {
                        toast()
                        return
                    } else {
                        handleClick(id)
                    }
                }}
                className={`py-2 px-3 ${
                    active && expanded ? 'text-primary' : active ? 'text-toned-text-color' : 'text-gray-500 hover:text-white transition-colors duration-200'
                }`}
            >
                {icon}
            </button>
            {/* <span
                className={`overflow-hidden transition-all flex items-start ${
                    expanded ? 'w-52 ml-3' : 'w-0'
                }`}
            >
                {expanded && text}
            </span> */}
            {/* </Link> */}
            {alert && (
                <div
                    className={`absolute right-2 w-2 h-2 rounded bg-primary ${
                        expanded ? '' : 'top-2'
                    }`}
                />
            )}
        </div>
    )
}

export default SidebarItem

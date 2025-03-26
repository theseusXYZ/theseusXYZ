import { PopoverContent } from '@/components/ui/popover'

const SafeStoragePopoverContent = () => (
    <PopoverContent side="top" className="bg-night w-fit p-2 px-3">
        Encrypted with Electron safeStorage and saves locally to secureData.bin
    </PopoverContent>
)

export default SafeStoragePopoverContent

import { SubStepType } from '../lib'

const SubStep: React.FC<{
    subStep: SubStepType
    showLine: boolean
    active: boolean
}> = ({ subStep, showLine, active }) => {
    return (
        <div className="relative flex flex-col pb-3">
            <div className="flex">
                <div
                    className={`z-10 flex items-center justify-center w-4 h-4 bg-gray-400 rounded-full translate-y-1 ${
                        active ? 'opacity-100' : 'opacity-0'
                    } transition-opacity duration-1000`}
                >
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
                <div
                    className={`ml-3 ${
                        active ? 'opacity-100' : 'opacity-0'
                    } transition-opacity duration-1000 delay-800`}
                >
                    <span className="text-white">{subStep.label}</span>
                    <span className="block mt-1 text-gray-400">
                        {subStep.subtitle}
                    </span>
                </div>
            </div>
            {showLine && (
                <div
                    className={`absolute w-px ${
                        active ? 'h-full' : 'h-0'
                    } bg-gray-400 left-2 transform translate-y-3 -translate-x-1/2 transition-all duration-1000 delay-800`}
                ></div>
            )}
        </div>
    )
}

export default SubStep

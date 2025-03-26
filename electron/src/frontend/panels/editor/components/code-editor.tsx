import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import Editor, { Monaco, DiffEditor } from '@monaco-editor/react'
import type { editor, Selection, IDisposable } from 'monaco-editor'
import FileTabs from '@/panels/editor/components/file-tabs/file-tabs'
import { File } from '@/lib/types'
import { atom, useAtom } from 'jotai'
import { Switch } from '@/components/ui/switch'
import {
    ICodeSnippet,
    SnippetId,
    FileId,
} from '@/panels/chat/components/ui/code-snippet'
import { getRelativePath, getFileName } from '@/lib/utils'
import { getCheckpointDiff } from '@/lib/services/sessionService/sessionService'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import { checkpointTrackerAtom } from '@/panels/timeline/lib'
import { useToast } from '@/components/ui/use-toast'

export const selectedCodeSnippetAtom = atom<ICodeSnippet | null>(null)

export default function CodeEditor({
    files,
    selectedFileId,
    setSelectedFileId,
    isExpandedVariant = false,
    showEditorBorders,
    path,
    initialFiles,
    originalValue,
    modifiedValue,
}: {
    files: File[]
    selectedFileId: string | null
    setSelectedFileId: (id: string | null) => void
    isExpandedVariant?: boolean
    showEditorBorders: boolean
    path: string
    initialFiles: File[]
    originalValue?: string
    modifiedValue?: string
}): JSX.Element {
    const [popoverVisible, setPopoverVisible] = useState(false)
    const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 })
    const [selectionInfo, setSelectionInfo] = useState<ICodeSnippet | null>(
        null
    )
    const [isEntireFileSelected, setIsEntireFileSelected] = useState(false)
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const monacoRef = useRef<Monaco | null>(null)
    const [openFiles, setOpenFiles] = useState<File[]>(initialFiles)
    const fileSelectionsRef = useRef<Record<string, Selection | null>>({})
    const initialPathRef = useRef<string | null>(null)
    const [, setSelectedCodeSnippet] = useAtom<ICodeSnippet | null>(
        selectedCodeSnippetAtom
    )
    const [checkpointTracker, setCheckpointTracker] = useAtom(
        checkpointTrackerAtom
    )
    const [showInlineDiff, setShowInlineDiff] = useState(false)

    useEffect(() => {
        if (
            initialPathRef.current === null ||
            path !== initialPathRef.current
        ) {
            setOpenFiles(initialFiles)
            setSelectedFileId(null)
            setPopoverVisible(false)
            setSelectionInfo(null)
            initialPathRef.current = path
        }
    }, [path])

    const addFileToOpenFiles = useCallback((file: File) => {
        setOpenFiles(prevOpenFiles => {
            if (!prevOpenFiles.some(f => f.id === file.id)) {
                return [...prevOpenFiles, file]
            }
            return prevOpenFiles
        })
    }, [])

    useEffect(() => {
        setOpenFiles(prevOpenFiles => {
            const newFiles = initialFiles.filter(
                file => !prevOpenFiles.some(openFile => openFile.id === file.id)
            )
            return [...prevOpenFiles, ...newFiles]
        })
    }, [initialFiles])

    const handleFileSelect = useCallback(
        (id: string) => {
            setSelectedFileId(id)
            const selectedFile = files.find(f => f.id === id)
            if (selectedFile) {
                addFileToOpenFiles(selectedFile)
            }
        },
        [setSelectedFileId, files, addFileToOpenFiles]
    )

    const handleCloseTab = useCallback(
        (id: string) => {
            setOpenFiles(prevOpenFiles =>
                prevOpenFiles.filter(file => file.id !== id)
            )
            if (selectedFileId === id) {
                const remainingFiles = openFiles.filter(file => file.id !== id)
                if (remainingFiles.length > 0) {
                    setSelectedFileId(
                        remainingFiles[remainingFiles.length - 1].id
                    )
                } else {
                    setSelectedFileId(null)
                }
            }
        },
        [openFiles, selectedFileId, setSelectedFileId]
    )

    const handleDiffEditorDidMount = useCallback(
        (editor: editor.IDiffEditor, monaco: Monaco) => {
            const modifiedEditor = editor.getModifiedEditor()
            editorRef.current = modifiedEditor
            monacoRef.current = monaco

            // Restore the previous selection for the file
            const previousSelection =
                fileSelectionsRef.current[selectedFileId ?? '']
            if (previousSelection) {
                modifiedEditor.setSelection(previousSelection)
            }
        },
        [selectedFileId]
    )

    const isSelectionVisible = useCallback(
        (editor: editor.IStandaloneCodeEditor, selection: Selection) => {
            const scrollTop = editor.getScrollTop()
            const scrollBottom = scrollTop + editor.getLayoutInfo().height
            const selectionTop = editor.getTopForLineNumber(
                selection.startLineNumber
            )
            const selectionBottom =
                editor.getTopForLineNumber(selection.endLineNumber) +
                editor.getOption(
                    monacoRef.current!.editor.EditorOption.lineHeight
                )

            return selectionTop >= scrollTop && selectionBottom <= scrollBottom
        },
        []
    )

    const updateSelectionInfo = useCallback(
        (
            editor: editor.IStandaloneCodeEditor,
            monaco: Monaco,
            selection: Selection,
            fileId: string
        ) => {
            const model = editor.getModel()
            const isAllSelected =
                model &&
                selection.equalsRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: model.getLineCount(),
                    endColumn: model.getLineMaxColumn(model.getLineCount()),
                })

            setIsEntireFileSelected(Boolean(isAllSelected))
            const range = new monaco.Range(
                selection.startLineNumber,
                selection.startColumn,
                selection.endLineNumber,
                selection.endColumn
            )
            const lineHeight = editor.getOption(
                monaco.editor.EditorOption.lineHeight
            )
            const scrollTop = editor.getScrollTop()
            const scrollBottom = scrollTop + editor.getLayoutInfo().height

            const toolTipYOffset = 50
            let top =
                editor.getTopForLineNumber(range.endLineNumber) +
                lineHeight -
                scrollTop +
                toolTipYOffset

            if (top < 0) {
                top = 0
            } else if (top > editor.getLayoutInfo().height - lineHeight) {
                top = editor.getLayoutInfo().height - lineHeight
            }

            const tooltipXOffset = 57
            const left = tooltipXOffset

            const selectedText = editor.getModel()?.getValueInRange(range)
            const relativePath = getRelativePath(fileId, path)
            const fileName = getFileName(fileId)
            const language =
                files?.find(f => f.id === fileId)?.language ?? 'text'

            const id: SnippetId = `${relativePath}:${selection.startLineNumber}-${selection.endLineNumber}`

            setSelectionInfo({
                id,
                fullPath: fileId,
                relativePath,
                fileName,
                selection: selectedText ?? '',
                startLineNumber: selection.startLineNumber,
                endLineNumber: selection.endLineNumber,
                startColumn: selection.startColumn,
                endColumn: selection.endColumn,
                language,
            })

            setPopoverPosition({ top, left })
            setPopoverVisible(true)
        },
        [files, path]
    )

    const handleEditorDidMount = useCallback(
        (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
            editorRef.current = editor
            monacoRef.current = monaco
            monaco.editor.defineTheme('theme', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {},
            })
            monaco.editor.setTheme('theme')
            reloadEditorForSyntaxHighlighting(editorRef)
        },
        []
    )

    useEffect(() => {
        if (editorRef.current) {
            reloadEditorForSyntaxHighlighting(editorRef)
        }
    }, [showInlineDiff, selectedFileId])

    useEffect(() => {
        if (!editorRef.current || !monacoRef.current) return

        const editor = editorRef.current
        const monaco = monacoRef.current

        const handleSelectionChange = (
            e: editor.ICursorSelectionChangedEvent
        ) => {
            const selection = editor.getSelection()
            if (
                selectedFileId &&
                selection &&
                !selection.isEmpty() &&
                isSelectionVisible(editor, selection)
            ) {
                fileSelectionsRef.current[selectedFileId] = selection
                updateSelectionInfo(editor, monaco, selection, selectedFileId)
            } else {
                setPopoverVisible(false)
            }
        }

        const handleScroll = () => {
            const selection = editor.getSelection()
            if (selectedFileId && selection && !selection.isEmpty()) {
                if (isSelectionVisible(editor, selection)) {
                    updateSelectionInfo(
                        editor,
                        monaco,
                        selection,
                        selectedFileId
                    )
                }
            }
        }

        const selectionDisposable = editor.onDidChangeCursorSelection(
            handleSelectionChange
        )
        const scrollDisposable = editor.onDidScrollChange(handleScroll)

        if (selectedFileId) {
            const storedSelection = fileSelectionsRef.current[selectedFileId]
            if (storedSelection) {
                editor.setSelection(storedSelection)
                updateSelectionInfo(
                    editor,
                    monaco,
                    storedSelection,
                    selectedFileId
                )
            } else {
                setPopoverVisible(false)
                editor.setSelection(new monaco.Selection(0, 0, 0, 0))
            }
        }

        return () => {
            selectionDisposable.dispose()
            scrollDisposable.dispose()
        }
    }, [selectedFileId, updateSelectionInfo, isSelectionVisible])

    useEffect(() => {
        const attachListeners = () => {
            if (!editorRef.current || !monacoRef.current) return

            const editor = editorRef.current
            const monaco = monacoRef.current

            const handleMouseUp = () => {
                const selection = editor.getSelection()
                if (selection && !selection.isEmpty()) {
                    setPopoverVisible(true)
                }
            }

            const handleSelectionChange = (
                e: editor.ICursorSelectionChangedEvent
            ) => {
                const selection = editor.getSelection()
                if (selectedFileId && selection && !selection.isEmpty()) {
                    fileSelectionsRef.current[selectedFileId] = selection
                    updateSelectionInfo(
                        editor,
                        monaco,
                        selection,
                        selectedFileId
                    )
                } else {
                    setPopoverVisible(false)
                }
            }

            const disposable = editor.onDidChangeCursorSelection(
                handleSelectionChange
            )

            // Restore selection when switching tabs or opening a new file
            if (selectedFileId) {
                const storedSelection =
                    fileSelectionsRef.current[selectedFileId]
                if (storedSelection) {
                    editor.setSelection(storedSelection)
                    updateSelectionInfo(
                        editor,
                        monaco,
                        storedSelection,
                        selectedFileId
                    )
                } else {
                    // Clear selection and hide popover when opening a new file
                    setPopoverVisible(false)
                    editor.setSelection(new monaco.Selection(0, 0, 0, 0))
                }
            }

            window.addEventListener('mouseup', handleMouseUp)

            return () => {
                disposable.dispose()
                window.removeEventListener('mouseup', handleMouseUp)
            }
        }

        // Initial attempt to attach listeners
        let cleanup = attachListeners()

        // If editor is not available, set up an interval to check periodically
        const checkInterval = setInterval(() => {
            if (editorRef.current && monacoRef.current) {
                clearInterval(checkInterval)
                if (cleanup) cleanup()
                cleanup = attachListeners()
            }
        }, 100) // Check every 100ms

        return () => {
            clearInterval(checkInterval)
            if (cleanup) cleanup()
        }
    }, [selectedFileId, updateSelectionInfo])

    useEffect(() => {
        if (selectedFileId) {
            const selectedFile = files.find(f => f.id === selectedFileId)
            if (selectedFile) {
                addFileToOpenFiles(selectedFile)
            }
        }
    }, [selectedFileId, files, addFileToOpenFiles])

    const handleAddCodeReference = () => {
        if (selectionInfo) {
            if (isEntireFileSelected && selectedFileId) {
                const relativePath = getRelativePath(selectedFileId, path)
                const id: FileId = relativePath
                setSelectedCodeSnippet({
                    ...selectionInfo,
                    id,
                    isEntireFile: true,
                })
            } else {
                setSelectedCodeSnippet(selectionInfo)
            }
        }
        // setPopoverVisible(false)
    }

    const isReverting = SessionMachineContext.useActorRef()
        .getSnapshot()
        .matches('reverting')

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            <div className="flex-none overflow-x-auto whitespace-nowrap bg-night border-b border-outlinecolor">
                <FileTabs
                    files={openFiles}
                    initialFiles={initialFiles}
                    selectedFileId={selectedFileId}
                    setSelectedFileId={handleFileSelect}
                    onCloseTab={handleCloseTab}
                    className={showEditorBorders ? '' : ''}
                    isExpandedVariant={isExpandedVariant}
                    loading={files.length === 0}
                    diffEnabled={showInlineDiff}
                    setDiffEnabled={setShowInlineDiff}
                />
            </div>
            {files && (
                <PathDisplay path={path} selectedFileId={selectedFileId} />
            )}
            <div className="flex-grow w-full bg-midnight rounded-b-lg mt-[-2px] overflow-auto">
                {(selectedFileId || checkpointTracker?.selected) &&
                !isReverting ? (
                    <BothEditorTypes
                        file={files?.find(f => f.id === selectedFileId)}
                        projectPath={path}
                        handleFileSelect={handleFileSelect}
                        handleEditorDidMount={handleEditorDidMount}
                        handleDiffEditorDidMount={handleDiffEditorDidMount}
                        showInlineDiff={showInlineDiff}
                        setShowInlineDiff={setShowInlineDiff}
                    />
                ) : null}
                {popoverVisible && (
                    <button
                        onClick={handleAddCodeReference}
                        className="absolute bg-night px-3 py-2 rounded-md shadow border hover:border-primary smooth-hover text-sm hover:bg-night z-50"
                        style={{
                            top: popoverPosition.top,
                            left: popoverPosition.left,
                        }}
                    >
                        {isEntireFileSelected
                            ? 'Mention file in chat'
                            : 'Mention snippet in chat'}
                    </button>
                )}
            </div>
        </div>
    )
}

const BothEditorTypes = ({
    file,
    projectPath,
    handleFileSelect,
    handleEditorDidMount,
    handleDiffEditorDidMount,
    showInlineDiff,
    setShowInlineDiff,
}: {
    file: File | undefined
    projectPath: string
    handleFileSelect: (id: string) => void
    handleEditorDidMount: (
        editor: editor.IStandaloneCodeEditor,
        monaco: Monaco
    ) => void
    handleDiffEditorDidMount: (
        editor: editor.IDiffEditor,
        monaco: Monaco
    ) => void
    showInlineDiff: boolean
    setShowInlineDiff: (show: boolean) => void
}) => {
    const [checkpointTracker, setCheckpointTracker] = useAtom(
        checkpointTrackerAtom
    )
    const [diffContent, setDiffContent] = useState<{
        before: string
        after: string
        file: string
    } | null>(null)
    const diffEditorRef = useRef<editor.IDiffEditor | null>(null)
    const { toast } = useToast()
    const host = SessionMachineContext.useSelector(state => state.context.host)
    const name = SessionMachineContext.useSelector(state => state.context.name)

    useEffect(() => {
        if (diffEditorRef.current) {
            reloadEditorForSyntaxHighlighting(diffEditorRef)
        }
    }, [diffContent, showInlineDiff, file?.id])

    const fetchDiff = async (autoSelectFile: boolean = false) => {
        try {
            if (!checkpointTracker) {
                setDiffContent(null)
                return
            }
            const srcId = checkpointTracker?.initial?.checkpoint_id
            const destId =
                checkpointTracker?.selected?.checkpoint_id ??
                checkpointTracker?.current?.checkpoint_id
            if (!srcId) {
                setDiffContent(null)
                toast({
                    title: 'Failed to get initial checkpoint id',
                })
                return
            }
            if (!destId) {
                setDiffContent(null)
                toast({
                    title: 'Failed to get destination checkpoint id',
                })
                return
            }

            const result = await getCheckpointDiff(host, name, srcId, destId)
            if (!result || result.files.length === 0) {
                setDiffContent(null)
                return
            }
            let fileInDiff: any = false
            if (file) {
                fileInDiff = result.files.find(
                    f => projectPath + '/' + f.file_path === file.id
                )
            }
            const p = fileInDiff
                ? fileInDiff.file_path
                : result.files[result.files.length - 1].file_path
            // Rn this opens the most recent unless the current file open is already in the diff (prevent switching when clicking through timeline)
            if (autoSelectFile && !fileInDiff) {
                const selectedFilePath = projectPath + '/' + p
                handleFileSelect(selectedFilePath)
            } else {
                setShowInlineDiff(true)
            }
            const fileDiff = result.files.find(f => f.file_path === p)
            // Only set the diff if current file is in it... might change later to just fileDiff
            // Added the fileInDiff condition to prevent flashing
            if (fileInDiff && fileDiff) {
                setDiffContent(fileDiff)
            } else {
                setDiffContent(null)
            }
            return fileInDiff
        } catch (error) {
            console.error('Error fetching diff:', error)
        }
        return false
    }

    useEffect(() => {
        if (Boolean(checkpointTracker?.selected)) {
            fetchDiff(true)
        } else if (!Boolean(checkpointTracker?.selected)) {
            setDiffContent(null)
        }
    }, [checkpointTracker?.selected])

    useEffect(() => {
        if (showInlineDiff) {
            fetchDiff()
        }
    }, [host, name, showInlineDiff])

    useEffect(() => {
        // If there's a selected checkpoint, check if the current file has a diff associated with it
        if (checkpointTracker?.selected || showInlineDiff) {
            fetchDiff().then(r => {
                setShowInlineDiff(r)
            })
        }
    }, [file?.path, file?.value])

    const customDiffEditorOptions = {
        readOnly: true,
        fontSize: 10,
        renderSideBySide: false, // This makes it an inline diff
        diffWordWrap: 'on',
        // Remove line decorations (including +/- signs)
        renderIndicators: false,
        // Customize diff colors
        diffAlgorithm: 'advanced',
        originalEditable: false,
        ignoreTrimWhitespace: false,
        // Disable the overview ruler (scrollbar annotations)
        overviewRulerLanes: 0,
    }

    const handleCustomDiffEditorDidMount = (editor, monaco) => {
        handleDiffEditorDidMount(editor, monaco)
        diffEditorRef.current = editor

        monaco.editor.defineTheme('custom-diff-theme', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'diffEditor.insertedTextBackground': '#2d592b',
                'diffEditor.removedTextBackground': '#FF000030',
                'diffEditor.insertedLineBackground': '#2d592b',
                'diffEditor.removedLineBackground': '#FF000030',
                'diffEditor.diagonalFill': '#00000000',
            },
        })
        monaco.editor.setTheme('custom-diff-theme')

        // Hide line numbers
        const modifiedEditor = editor.getModifiedEditor()
        modifiedEditor.updateOptions()
        const originalEditor = editor.getOriginalEditor()
        originalEditor.updateOptions({
            lineNumbers: 'off',
        })
    }

    if (showInlineDiff && diffContent) {
        return (
            <DiffEditor
                className="h-full"
                theme="vs-dark"
                original={diffContent.before}
                modified={diffContent.after}
                language={file?.language ?? 'python'}
                onMount={handleCustomDiffEditorDidMount}
                options={customDiffEditorOptions}
            />
        )
    }

    return (
        <>
            <Editor
                className="h-full"
                theme="vs-dark"
                defaultLanguage={'python'}
                language={file?.language ?? 'python'}
                defaultValue={''}
                value={
                    checkpointTracker?.selected && diffContent
                        ? diffContent.after
                        : file?.value ?? ''
                }
                onMount={handleEditorDidMount}
                path={file?.path}
                options={{ readOnly: true, fontSize: 10 }}
            />
        </>
    )
}

function getPathBeforeLastSlash(str: string) {
    // Remove trailing slash if it exists
    str = str.replace(/\/$/, '')

    // Find the position of the last slash
    const lastSlashIndex = str.lastIndexOf('/')

    // Return the substring before the last slash
    return lastSlashIndex !== -1 ? str.substring(0, lastSlashIndex) : ''
}

const PathDisplay = ({
    path,
    selectedFileId,
}: {
    path: string
    selectedFileId: string | null
}) => (
    <div
        className={`px-3 pb-[4px] ${
            selectedFileId ? 'bg-editor-night -mt-[2px]' : 'pt-[3px]'
        }`}
    >
        <p className="text-xs text-neutral-500 text-ellipsis">
            {selectedFileId
                ? convertPath(
                      selectedFileId.replace(getPathBeforeLastSlash(path), '')
                  )
                : path
                ? convertPath(path)
                : ''}
        </p>
    </div>
)

export function convertPath(path: string) {
    // Split the path based on the separator, either "/" or "\"
    const parts = path.split(/[/\\]/)

    // Remove unwanted parts (e.g., initial "Users" or "C:" for Windows paths)
    const filteredParts = parts.filter(
        part => part && part !== 'Users' && !part.includes(':')
    )

    // Join the remaining parts with the custom separator
    const customPath = filteredParts.join(' > ')

    return customPath
}

function isDiffEditor(editor: any): editor is editor.IDiffEditor {
    return 'getModifiedEditor' in editor && 'getOriginalEditor' in editor
}

function reloadEditorForSyntaxHighlighting(
    editorRef: React.RefObject<
        editor.IDiffEditor | editor.IStandaloneCodeEditor
    >
) {
    setTimeout(() => {
        const currentEditor = editorRef.current
        if (!currentEditor) return

        if (isDiffEditor(currentEditor)) {
            const modifiedEditor = currentEditor.getModifiedEditor()
            const originalEditor = currentEditor.getOriginalEditor()
            // Unfortunately this was the best fix I could figure out to make the editor show the diff
            // Simulate a small scroll in both editors
            modifiedEditor.setScrollTop(1)
            modifiedEditor.setScrollTop(0)
            originalEditor.setScrollTop(1)
            originalEditor.setScrollTop(0)
        } else {
            // Unfortunately this was the best fix I could figure out to make the editor show the diff
            // Simulate a small scroll in both editors
            currentEditor.setScrollTop(1)
            currentEditor.setScrollTop(0)
        }
    }, 50) // Small delay to ensure content is loaded
}

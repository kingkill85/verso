local DocSettings = require("docsettings")
local ReadHistory = require("readhistory")
local ReaderUI = require("apps/reader/readerui")
local logger = require("logger")

local VersoSyncAnnotationReader = {}

function VersoSyncAnnotationReader.getAnnotationsForCurrentBook()
    if not ReaderUI.instance then return nil, nil end

    local ui = ReaderUI.instance
    -- Flush annotations to disk
    if ui.doc_settings then
        ui.doc_settings:flush()
    end

    local annotations = ui.doc_settings:readSetting("annotations") or {}
    local md5 = ui.document:getProps().partial_md5_checksum
    local total_pages = ui.document:getPageCount()

    local result = {}
    for _, ann in ipairs(annotations) do
        table.insert(result, {
            datetime = ann.datetime,
            drawer = ann.drawer,
            color = ann.color,
            text = ann.text,
            note = ann.note,
            chapter = ann.chapter,
            pageno = ann.pageno,
            page = ann.page,
            total_pages = total_pages,
            pos0 = ann.pos0,
            pos1 = ann.pos1,
            datetime_updated = ann.datetime_updated,
        })
    end

    return md5, result
end

function VersoSyncAnnotationReader.getAllBooksWithAnnotations()
    local all_books = {}

    for _, entry in ipairs(ReadHistory.hist) do
        if not entry.dim then -- skip deleted files
            local sidecar = DocSettings:findSidecarFile(entry.file)
            if sidecar then
                local ok, doc_settings = pcall(DocSettings.openSettingsFile, DocSettings, sidecar)
                if ok and doc_settings then
                    local annotations = doc_settings:readSetting("annotations") or {}
                    local md5 = doc_settings:readSetting("partial_md5_checksum")
                    local doc_pages = doc_settings:readSetting("doc_pages")
                    local doc_props = doc_settings:readSetting("doc_props") or {}

                    if md5 and #annotations > 0 then
                        local book_annotations = {}
                        for _, ann in ipairs(annotations) do
                            table.insert(book_annotations, {
                                datetime = ann.datetime,
                                drawer = ann.drawer,
                                color = ann.color,
                                text = ann.text,
                                note = ann.note,
                                chapter = ann.chapter,
                                pageno = ann.pageno,
                                page = ann.page,
                                total_pages = doc_pages,
                                pos0 = ann.pos0,
                                pos1 = ann.pos1,
                                datetime_updated = ann.datetime_updated,
                            })
                        end

                        table.insert(all_books, {
                            md5 = md5,
                            annotations = book_annotations,
                            metadata = {
                                md5 = md5,
                                title = doc_props.title or entry.text or "Unknown",
                                authors = doc_props.authors or "Unknown",
                                pages = doc_pages or 0,
                                series = doc_props.series or "",
                                language = doc_props.language or "",
                            },
                        })
                    end
                end
            end
        end
    end

    return all_books
end

return VersoSyncAnnotationReader

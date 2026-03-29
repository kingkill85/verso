local callApi = require("call_api")
local VersoSyncSettings = require("settings")
local VersoSyncDbReader = require("db_reader")
local VersoSyncAnnotationReader = require("annotation_reader")
local VersoSyncConst = require("const")
local logger = require("logger")

local VersoSyncUpload = {}

local function getCredentials()
    return VersoSyncSettings:getEmail(), VersoSyncSettings:getPassword()
end

local function sendDevice(server_url)
    local email, password = getCredentials()
    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    local device_model = G_reader_settings:readSetting("device_model") or "KOReader"

    return callApi("POST", server_url .. "/api/sync/device", nil, {
        id = device_id,
        model = device_model,
        version = VersoSyncConst.VERSION,
    }, email, password)
end

local function sendStatistics(server_url, stats, books, annotations, device_id)
    local email, password = getCredentials()

    local payload = {
        version = VersoSyncConst.VERSION,
        stats = stats,
        books = books,
        annotations = annotations or {},
    }

    if device_id then
        payload.device_id = device_id
    end

    return callApi("POST", server_url .. "/api/sync/import", nil, payload, email, password)
end

function VersoSyncUpload.syncCurrentBook(server_url, silent)
    if not VersoSyncSettings:isConfigured() then
        if not silent then
            logger.warn("Verso Sync: not configured")
        end
        return false
    end

    -- Register device
    local ok, err = sendDevice(server_url)
    if not ok then
        logger.warn("Verso Sync: device registration failed:", err)
    end

    -- Get data
    local stats = VersoSyncDbReader.progressData()
    local books = VersoSyncDbReader.bookData()

    -- Get current book annotations
    local annotations = {}
    local md5, book_annotations = VersoSyncAnnotationReader.getAnnotationsForCurrentBook()
    if md5 and book_annotations and #book_annotations > 0 then
        annotations[md5] = book_annotations
    end

    -- Send
    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    ok, err = sendStatistics(server_url, stats, books, annotations, device_id)
    if not ok then
        logger.warn("Verso Sync: import failed:", err)
        return false
    end

    return true
end

function VersoSyncUpload.syncAllBooks(server_url, progress_callback)
    if not VersoSyncSettings:isConfigured() then return false end

    -- Register device
    local ok, err = sendDevice(server_url)
    if not ok then
        logger.warn("Verso Sync: device registration failed:", err)
    end

    -- Get statistics data
    local stats = VersoSyncDbReader.progressData()
    local books = VersoSyncDbReader.bookData()

    -- First: send stats with current book annotations
    local annotations = {}
    local md5, book_annotations = VersoSyncAnnotationReader.getAnnotationsForCurrentBook()
    if md5 and book_annotations and #book_annotations > 0 then
        annotations[md5] = book_annotations
    end

    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    ok, err = sendStatistics(server_url, stats, books, annotations, device_id)
    if not ok then
        logger.warn("Verso Sync: initial import failed:", err)
        return false
    end

    -- Then: send annotations for all other books
    local all_books = VersoSyncAnnotationReader.getAllBooksWithAnnotations()
    for i, book_data in ipairs(all_books) do
        if progress_callback then
            progress_callback(i, #all_books, book_data.metadata.title)
        end
        if book_data.md5 ~= md5 then -- skip current book, already sent
            local book_annotations_map = { [book_data.md5] = book_data.annotations }
            local book_list = { book_data.metadata }
            sendStatistics(server_url, {}, book_list, book_annotations_map, device_id)
        end
    end

    return true
end

return VersoSyncUpload

local DataStorage = require("datastorage")
local logger = require("logger")
local SQ3 = require("lua-ljsqlite3/init")
local ReaderUI = require("apps/reader/readerui")

local VersoSyncDbReader = {}

local function getDb()
    local db_path = DataStorage:getSettingsDir() .. "/statistics.sqlite3"
    return SQ3.open(db_path)
end

function VersoSyncDbReader.bookData()
    local conn = getDb()
    if not conn then return {} end

    local books = {}
    local stmt = conn:prepare("SELECT * FROM book")
    if not stmt then
        conn:close()
        return {}
    end

    local current_pages = nil
    if ReaderUI.instance and ReaderUI.instance.document then
        current_pages = ReaderUI.instance.document:getPageCount()
    end

    for row in stmt:rows() do
        local book = {
            id = row[1],
            title = row[2],
            authors = row[3],
            notes = row[4],
            last_open = row[5],
            highlights = row[6],
            pages = row[7],
            series = row[8],
            language = row[9],
            md5 = row[10],
            total_read_time = row[11],
            total_read_pages = row[12],
        }
        -- Use live page count for currently open book
        if current_pages and ReaderUI.instance
           and ReaderUI.instance.document
           and book.md5 == ReaderUI.instance.document:getProps().partial_md5_checksum then
            book.pages = current_pages
        end
        table.insert(books, book)
    end
    stmt:close()
    conn:close()
    return books
end

function VersoSyncDbReader.progressData()
    -- Flush in-memory stats to DB first
    if ReaderUI.instance and ReaderUI.instance.statistics then
        ReaderUI.instance.statistics:insertDB()
    end

    local conn = getDb()
    if not conn then return {} end

    local books = VersoSyncDbReader.bookData()
    local book_id_to_md5 = {}
    for _, book in ipairs(books) do
        book_id_to_md5[book.id] = book.md5
    end

    local stats = {}
    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    local stmt = conn:prepare("SELECT page, start_time, duration, total_pages, id_book FROM page_stat_data")
    if not stmt then
        conn:close()
        return stats
    end

    for row in stmt:rows() do
        local md5 = book_id_to_md5[row[5]]
        if md5 then
            table.insert(stats, {
                page = row[1],
                start_time = row[2],
                duration = row[3],
                total_pages = row[4],
                book_md5 = md5,
                device_id = device_id,
            })
        end
    end
    stmt:close()
    conn:close()
    return stats
end

return VersoSyncDbReader

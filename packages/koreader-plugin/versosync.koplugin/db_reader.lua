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
            id = tonumber(row[1]),
            title = tostring(row[2] or ""),
            authors = tostring(row[3] or ""),
            notes = tonumber(row[4]) or 0,
            last_open = tostring(row[5] or ""),
            highlights = tonumber(row[6]) or 0,
            pages = tonumber(row[7]) or 0,
            series = tostring(row[8] or ""),
            language = tostring(row[9] or ""),
            md5 = tostring(row[10] or ""),
            total_read_time = tonumber(row[11]) or 0,
            total_read_pages = tonumber(row[12]) or 0,
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
        local md5 = book_id_to_md5[tonumber(row[5])]
        if md5 then
            table.insert(stats, {
                page = tonumber(row[1]),
                start_time = tonumber(row[2]),
                duration = tonumber(row[3]),
                total_pages = tonumber(row[4]),
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

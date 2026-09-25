'use client'

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'

type ItemSource = {
  id: string
  name: string
  abbreviation: string | null
}

type Item = {
  id: string
  item_number: string
  description: string
  unit: string
  specification_section: string | null
  item_type: string
  source_id: string | null
  item_sources?: {
    name: string
    abbreviation: string | null
  } | null
}

type CivilBidField =
  | 'item_number'
  | 'description'
  | 'unit'
  | 'specification_section'
  | 'specification_year'
  | 'item_class'
  | 'standard_status'

type ColumnMap = Record<CivilBidField, string>

type RawRow = Record<string, unknown>

type ImportRow = {
  item_number: string
  description: string
  unit: string
  specification_section: string
  specification_year: string
  item_class: string
  standard_status: string
}

type ImportResult = {
  batch_id: string
  received: number
  inserted: number
  updated: number
  rejected: number
}

const emptyMapping: ColumnMap = {
  item_number: '',
  description: '',
  unit: '',
  specification_section: '',
  specification_year: '',
  item_class: '',
  standard_status: ''
}

const fieldLabels: Record<CivilBidField, string> = {
  item_number: 'Item Number',
  description: 'Description',
  unit: 'Unit',
  specification_section: 'Specification Section',
  specification_year: 'Specification Year',
  item_class: 'Item Class',
  standard_status: 'Standard Status'
}

const requiredFields: CivilBidField[] = [
  'item_number',
  'description',
  'unit'
]

const aliases: Record<CivilBidField, string[]> = {
  item_number: [
    'item',
    'item_no',
    'item_number',
    'item_code',
    'pay_item',
    'pay_item_no',
    'pay_item_number'
  ],

  description: [
    'description',
    'item_description',
    'pay_item_description'
  ],

  unit: [
    'unit',
    'units',
    'uom',
    'unit_of_measure'
  ],

  specification_section: [
    'section',
    'spec_section',
    'specification_section'
  ],

  specification_year: [
    'spec_year',
    'specification_year'
  ],

  item_class: [
    'class',
    'item_class'
  ],

  standard_status: [
    'status',
    'standard_status'
  ]
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function valueToString(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export default function ItemsPage() {
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<Item[]>([])
  const [sources, setSources] = useState<ItemSource[]>([])
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const [showImport, setShowImport] = useState(false)
  const [importSource, setImportSource] = useState('NJDOT')

  const [fileName, setFileName] = useState('')
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMap>(emptyMapping)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] =
    useState<ImportResult | null>(null)

  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [
      { data: itemData },
      { data: sourceData }
    ] = await Promise.all([
      supabase
        .from('items')
        .select(`
          id,
          item_number,
          description,
          unit,
          specification_section,
          item_type,
          source_id,
          item_sources (
            name,
            abbreviation
          )
        `)
        .eq('active', true)
        .order('item_number')
        .limit(1000),

      supabase
        .from('item_sources')
        .select('id,name,abbreviation')
        .eq('active', true)
        .order('name')
    ])

    setItems((itemData as unknown as Item[]) || [])
    setSources(sourceData || [])
    setLoading(false)
  }

  const filteredItems = items.filter(item => {
    const q = search.toLowerCase().trim()

    const matchesSearch =
      !q ||
      item.item_number.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)

    const matchesSource =
      sourceFilter === 'all' ||
      item.item_sources?.abbreviation === sourceFilter

    return matchesSearch && matchesSource
  })

  function autoMap(columns: string[]) {
    const result: ColumnMap = { ...emptyMapping }

    for (const field of Object.keys(fieldLabels) as CivilBidField[]) {
      const match = columns.find(column =>
        aliases[field].includes(normalizeHeader(column))
      )

      if (match) {
        result[field] = match
      }
    }

    return result
  }

  function loadWorksheet(
    currentWorkbook: XLSX.WorkBook,
    selectedSheet: string
  ) {
    const sheet = currentWorkbook.Sheets[selectedSheet]

    if (!sheet) {
      setError('The selected worksheet could not be read.')
      return
    }

    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, {
      defval: '',
      raw: false
    })

    if (rows.length === 0) {
      setRawRows([])
      setHeaders([])
      setMapping(emptyMapping)
      setError('This worksheet does not contain any data rows.')
      return
    }

    const discoveredHeaders = Array.from(
      new Set(
        rows.flatMap(row => Object.keys(row))
      )
    )

    setRawRows(rows)
    setHeaders(discoveredHeaders)
    setMapping(autoMap(discoveredHeaders))
    setError('')
    setImportResult(null)
  }

  async function handleFile(file: File | undefined) {
    if (!file) return

    setError('')
    setImportResult(null)
    setRawRows([])
    setHeaders([])
    setMapping(emptyMapping)
    setFileName(file.name)

    const extension =
      file.name.split('.').pop()?.toLowerCase() || ''

    if (!['xlsx', 'xls', 'csv'].includes(extension)) {
      setError(
        'Please upload an XLSX, XLS, or CSV item catalog.'
      )
      return
    }

    try {
      const data = await file.arrayBuffer()

      const parsedWorkbook = XLSX.read(data, {
        type: 'array'
      })

      if (parsedWorkbook.SheetNames.length === 0) {
        setError('The uploaded file contains no worksheets.')
        return
      }

      setWorkbook(parsedWorkbook)

      const firstSheet = parsedWorkbook.SheetNames[0]

      setSheetName(firstSheet)

      loadWorksheet(parsedWorkbook, firstSheet)
    } catch (err) {
      console.error(err)

      setError(
        'CivilBid could not read this spreadsheet. Verify that the file is a valid XLSX, XLS, or CSV file.'
      )
    }
  }

  function changeWorksheet(name: string) {
    if (!workbook) return

    setSheetName(name)
    loadWorksheet(workbook, name)
  }

  function updateMapping(
    field: CivilBidField,
    column: string
  ) {
    setMapping(current => ({
      ...current,
      [field]: column
    }))
  }

  function buildImportRow(row: RawRow): ImportRow {
    function get(field: CivilBidField) {
      const column = mapping[field]

      if (!column) return ''

      return valueToString(row[column])
    }

    const status = get('standard_status')

    return {
      item_number: get('item_number'),
      description: get('description'),
      unit: get('unit'),
      specification_section:
        get('specification_section'),
      specification_year:
        get('specification_year'),
      item_class:
        get('item_class'),
      standard_status:
        status || 'unknown'
    }
  }

  const mappedRows = useMemo(
    () => rawRows.map(buildImportRow),
    [rawRows, mapping]
  )

  const validRows = mappedRows.filter(row =>
    row.item_number &&
    row.description &&
    row.unit
  )

  const invalidRows = mappedRows.filter(row =>
    !row.item_number ||
    !row.description ||
    !row.unit
  )

  const requiredMappingsComplete =
    requiredFields.every(field => mapping[field])

  async function runImport() {
    if (!fileName) return

    if (!requiredMappingsComplete) {
      setError(
        'Map Item Number, Description, and Unit before importing.'
      )
      return
    }

    if (validRows.length === 0) {
      setError('There are no valid rows to import.')
      return
    }

    setImporting(true)
    setError('')
    setImportResult(null)

    const { data, error: importError } =
      await supabase.rpc('import_agency_items', {
        p_source_abbreviation: importSource,
        p_filename: fileName,
        p_items: validRows
      })

    if (importError) {
      setError(importError.message)
      setImporting(false)
      return
    }

    setImportResult(data as ImportResult)
    setImporting(false)

    await loadData()
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16
        }}
      >
        <div>
          <h1>Items</h1>

          <p style={{ opacity: 0.7 }}>
            Universal bid item library for public agencies,
            private work, and company-created items.
          </p>
        </div>

        <button
          onClick={() => {
            setShowImport(!showImport)
            setError('')
          }}
        >
          Import Items
        </button>
      </div>

      {showImport && (
        <div
          className="card"
          style={{ marginBottom: 20 }}
        >
          <h2>Import Item Catalog</h2>

          <p style={{ opacity: 0.7 }}>
            Upload an XLSX, XLS, or CSV catalog, map its
            columns to CivilBid, validate the data, and
            import it into the selected source.
          </p>

          <div style={{ marginTop: 18 }}>
            <label>
              <strong>Source</strong>
            </label>

            <br />

            <select
              value={importSource}
              onChange={e =>
                setImportSource(e.target.value)
              }
              style={{ marginTop: 6 }}
            >
              {sources
                .filter(source => source.abbreviation)
                .map(source => (
                  <option
                    key={source.id}
                    value={source.abbreviation || ''}
                  >
                    {source.name}
                    {source.abbreviation
                      ? ` (${source.abbreviation})`
                      : ''}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ marginTop: 18 }}>
            <label>
              <strong>Catalog File</strong>
            </label>

            <br />

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e =>
                handleFile(e.target.files?.[0])
              }
              style={{ marginTop: 6 }}
            />
          </div>

          {workbook &&
            workbook.SheetNames.length > 1 && (
              <div style={{ marginTop: 18 }}>
                <label>
                  <strong>Worksheet</strong>
                </label>

                <br />

                <select
                  value={sheetName}
                  onChange={e =>
                    changeWorksheet(e.target.value)
                  }
                  style={{ marginTop: 6 }}
                >
                  {workbook.SheetNames.map(name => (
                    <option
                      key={name}
                      value={name}
                    >
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}

          {headers.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <h3>Column Mapping</h3>

              <p style={{ opacity: 0.7 }}>
                CivilBid automatically mapped the columns it
                recognized. Review the selections before
                importing.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit,minmax(220px,1fr))',
                  gap: 14
                }}
              >
                {(
                  Object.keys(
                    fieldLabels
                  ) as CivilBidField[]
                ).map(field => (
                  <div key={field}>
                    <label>
                      <strong>
                        {fieldLabels[field]}
                        {requiredFields.includes(field)
                          ? ' *'
                          : ''}
                      </strong>
                    </label>

                    <br />

                    <select
                      value={mapping[field]}
                      onChange={e =>
                        updateMapping(
                          field,
                          e.target.value
                        )
                      }
                      style={{
                        width: '100%',
                        marginTop: 6
                      }}
                    >
                      <option value="">
                        Not mapped
                      </option>

                      {headers.map(header => (
                        <option
                          key={header}
                          value={header}
                        >
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rawRows.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <h3>Validation</h3>

              <p>
                <strong>
                  {rawRows.length.toLocaleString()}
                </strong>{' '}
                rows detected
              </p>

              <p>
                <strong>
                  {validRows.length.toLocaleString()}
                </strong>{' '}
                valid
              </p>

              <p>
                <strong>
                  {invalidRows.length.toLocaleString()}
                </strong>{' '}
                need attention
              </p>

              <p style={{ opacity: 0.65 }}>
                Required fields: Item Number,
                Description, Unit
              </p>
            </div>
          )}

          {mappedRows.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <h3>Preview</h3>

              <p style={{ opacity: 0.7 }}>
                Showing the first 10 rows.
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th>Section</th>
                      <th>Spec Year</th>
                      <th>Class</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {mappedRows
                      .slice(0, 10)
                      .map((row, index) => (
                        <tr key={index}>
                          <td>
                            {row.item_number || '⚠'}
                          </td>

                          <td>
                            {row.description || '⚠'}
                          </td>

                          <td>
                            {row.unit || '⚠'}
                          </td>

                          <td>
                            {row.specification_section ||
                              '—'}
                          </td>

                          <td>
                            {row.specification_year ||
                              '—'}
                          </td>

                          <td>
                            {row.item_class || '—'}
                          </td>

                          <td>
                            {row.standard_status}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={runImport}
                disabled={
                  importing ||
                  !requiredMappingsComplete ||
                  validRows.length === 0
                }
                style={{ marginTop: 18 }}
              >
                {importing
                  ? 'Importing...'
                  : `Import ${validRows.length.toLocaleString()} Valid Items`}
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 18,
                padding: 12,
                border: '1px solid currentColor'
              }}
            >
              {error}
            </div>
          )}

          {importResult && (
            <div
              className="card"
              style={{ marginTop: 22 }}
            >
              <h3>Import Complete</h3>

              <p>
                <strong>Received:</strong>{' '}
                {importResult.received.toLocaleString()}
              </p>

              <p>
                <strong>New:</strong>{' '}
                {importResult.inserted.toLocaleString()}
              </p>

              <p>
                <strong>Updated:</strong>{' '}
                {importResult.updated.toLocaleString()}
              </p>

              <p>
                <strong>Rejected:</strong>{' '}
                {importResult.rejected.toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 20
          }}
        >
          <input
            value={search}
            onChange={e =>
              setSearch(e.target.value)
            }
            placeholder="Search item number or description..."
            style={{ minWidth: 280 }}
          />

          <select
            value={sourceFilter}
            onChange={e =>
              setSourceFilter(e.target.value)
            }
          >
            <option value="all">
              All Sources
            </option>

            {sources
              .filter(source => source.abbreviation)
              .map(source => (
                <option
                  key={source.id}
                  value={source.abbreviation || ''}
                >
                  {source.abbreviation}
                </option>
              ))}
          </select>
        </div>

        {loading ? (
          <p>Loading items...</p>
        ) : (
          <>
            <p style={{ opacity: 0.65 }}>
              {filteredItems.length.toLocaleString()} items
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Unit</th>
                    <th>Source</th>
                    <th>Section</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map(item => (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          {item.item_number}
                        </strong>
                      </td>

                      <td>
                        {item.description}
                      </td>

                      <td>
                        {item.unit}
                      </td>

                      <td>
                        {item.item_sources
                          ?.abbreviation ||
                          'Company'}
                      </td>

                      <td>
                        {item.specification_section ||
                          '—'}
                      </td>
                    </tr>
                  ))}

                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        No items found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  )
}

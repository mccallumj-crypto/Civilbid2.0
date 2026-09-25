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

type ImportType = 'catalog' | 'bid_history'

type RawRow = Record<string, unknown>
type ColumnMap = Record<string, string>

type ImportResult = {
  batch_id?: string
  received: number
  inserted: number
  updated?: number
  rejected: number
}

type SyncResult = {
  success: boolean
  sync_run_id?: string
  bid_tabulations_discovered?: number
  new_documents?: number
  existing_documents?: number
  failed_documents?: number
  message?: string
  error?: string
}

const catalogLabels: Record<string, string> = {
  item_number: 'Item Number',
  description: 'Description',
  unit: 'Unit',
  specification_section: 'Specification Section',
  specification_year: 'Specification Year',
  item_class: 'Item Class',
  standard_status: 'Standard Status',
}

const bidLabels: Record<string, string> = {
  item_number: 'Item Number',
  description: 'Description',
  unit: 'Unit',
  contract_number: 'Contract Number',
  project_name: 'Project Name',
  bid_date: 'Bid Date',
  county: 'County',
  region: 'Region',
  bidder_name: 'Bidder Name',
  bidder_rank: 'Bidder Rank',
  is_awarded_bidder: 'Awarded Bidder',
  quantity: 'Quantity',
  unit_price: 'Unit Price',
  engineer_estimate_unit_price: 'Engineer Estimate Unit Price',
}

const aliases: Record<string, string[]> = {
  item_number: [
    'item',
    'item_no',
    'item_number',
    'item_code',
    'pay_item',
    'pay_item_no',
    'pay_item_number',
  ],
  description: [
    'description',
    'item_description',
    'pay_item_description',
  ],
  unit: [
    'unit',
    'units',
    'uom',
    'unit_of_measure',
    'units_type',
  ],
  specification_section: [
    'section',
    'spec_section',
    'specification_section',
  ],
  specification_year: [
    'spec_year',
    'specification_year',
  ],
  item_class: [
    'class',
    'item_class',
  ],
  standard_status: [
    'status',
    'standard_status',
  ],
  contract_number: [
    'contract',
    'contract_no',
    'contract_number',
    'contract_id',
  ],
  project_name: [
    'project',
    'project_name',
    'project_description',
    'contract_description',
  ],
  bid_date: [
    'bid_date',
    'letting_date',
    'proposal_date',
    'award_date',
  ],
  county: [
    'county',
    'county_name',
  ],
  region: [
    'region',
    'district',
  ],
  bidder_name: [
    'bidder',
    'bidder_name',
    'contractor',
    'contractor_name',
    'vendor',
  ],
  bidder_rank: [
    'rank',
    'bidder_rank',
    'bid_rank',
  ],
  is_awarded_bidder: [
    'awarded',
    'award',
    'is_awarded',
    'is_awarded_bidder',
    'winning_bidder',
  ],
  quantity: [
    'quantity',
    'qty',
    'bid_quantity',
    'estimated_quantity',
  ],
  unit_price: [
    'unit_price',
    'bid_price',
    'award_price',
    'price',
  ],
  engineer_estimate_unit_price: [
    'engineer_estimate_unit_price',
    'engineers_estimate_unit_price',
    'engineer_unit_price',
    'estimate_unit_price',
  ],
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
  const [importType, setImportType] =
    useState<ImportType>('catalog')
  const [importSource, setImportSource] = useState('NJDOT')

  const [fileName, setFileName] = useState('')
  const [workbook, setWorkbook] =
    useState<XLSX.WorkBook | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMap>({})

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] =
    useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] =
    useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState('')

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [
      { data: itemData, error: itemError },
      { data: sourceData, error: sourceError },
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
        .order('name'),
    ])

    if (itemError) {
      console.error('Item loading error:', itemError)
    }

    if (sourceError) {
      console.error('Source loading error:', sourceError)
    }

    setItems((itemData as unknown as Item[]) || [])
    setSources(sourceData || [])
    setLoading(false)
  }

  const labels =
    importType === 'catalog'
      ? catalogLabels
      : bidLabels

  const fields = Object.keys(labels)

  const requiredFields =
    importType === 'catalog'
      ? ['item_number', 'description', 'unit']
      : ['item_number', 'unit_price']

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

  function resetImportFile() {
    setFileName('')
    setWorkbook(null)
    setSheetName('')
    setRawRows([])
    setHeaders([])
    setMapping({})
    setImportResult(null)
    setError('')
  }

  function changeImportType(type: ImportType) {
    setImportType(type)
    resetImportFile()
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

    const rows =
      XLSX.utils.sheet_to_json<RawRow>(sheet, {
        defval: '',
        raw: false,
      })

    if (rows.length === 0) {
      setRawRows([])
      setHeaders([])
      setMapping({})
      setError(
        'This worksheet does not contain any data rows.'
      )
      return
    }

    const discoveredHeaders = Array.from(
      new Set(rows.flatMap(row => Object.keys(row)))
    )

    const newMapping: ColumnMap = {}

    fields.forEach(field => {
      const match = discoveredHeaders.find(column =>
        (aliases[field] || []).includes(
          normalizeHeader(column)
        )
      )

      newMapping[field] = match || ''
    })

    setRawRows(rows)
    setHeaders(discoveredHeaders)
    setMapping(newMapping)
    setError('')
    setImportResult(null)
  }

  async function handleFile(file: File | undefined) {
    if (!file) return

    setError('')
    setImportResult(null)
    setRawRows([])
    setHeaders([])
    setMapping({})
    setFileName(file.name)

    const extension =
      file.name.split('.').pop()?.toLowerCase() || ''

    if (!['xlsx', 'xls', 'csv'].includes(extension)) {
      setError(
        'Please upload an XLSX, XLS, or CSV file.'
      )
      return
    }

    try {
      const data = await file.arrayBuffer()

      const parsedWorkbook = XLSX.read(data, {
        type: 'array',
      })

      if (parsedWorkbook.SheetNames.length === 0) {
        setError(
          'The uploaded file contains no worksheets.'
        )
        return
      }

      const firstSheet = parsedWorkbook.SheetNames[0]

      setWorkbook(parsedWorkbook)
      setSheetName(firstSheet)

      loadWorksheet(parsedWorkbook, firstSheet)
    } catch (err) {
      console.error(err)
      setError(
        'CivilBid could not read this spreadsheet.'
      )
    }
  }

  function changeWorksheet(name: string) {
    if (!workbook) return

    setSheetName(name)
    loadWorksheet(workbook, name)
  }

  function updateMapping(field: string, column: string) {
    setMapping(current => ({
      ...current,
      [field]: column,
    }))
  }

  const mappedRows = useMemo(() => {
    return rawRows.map(row => {
      const mapped: Record<string, string> = {}

      fields.forEach(field => {
        const column = mapping[field]

        mapped[field] = column
          ? valueToString(row[column])
          : ''
      })

      if (
        importType === 'catalog' &&
        !mapped.standard_status
      ) {
        mapped.standard_status = 'unknown'
      }

      return mapped
    })
  }, [rawRows, mapping, importType])

  const validRows = mappedRows.filter(row =>
    requiredFields.every(field =>
      Boolean(row[field]?.trim())
    )
  )

  const invalidRows = mappedRows.filter(row =>
    !requiredFields.every(field =>
      Boolean(row[field]?.trim())
    )
  )

  const requiredMappingsComplete =
    requiredFields.every(field =>
      Boolean(mapping[field])
    )

  async function syncNJDOT() {
    if (syncing) return

    setSyncing(true)
    setSyncError('')
    setSyncResult(null)

    try {
      const {
        data,
        error: functionError,
      } = await supabase.functions.invoke(
        'sync-njdot',
        {
          body: {},
        }
      )

      console.log('sync-njdot response:', {
        data,
        functionError,
      })

      if (functionError) {
        throw new Error(
          functionError.message ||
            'The NJDOT Edge Function failed.'
        )
      }

      const result = data as SyncResult | null

      if (!result) {
        throw new Error(
          'The NJDOT Edge Function returned no data.'
        )
      }

      if (!result.success) {
        throw new Error(
          result.error || 'NJDOT synchronization failed.'
        )
      }

      setSyncResult(result)
    } catch (err) {
      console.error('NJDOT sync error:', err)

      setSyncError(
        err instanceof Error
          ? err.message
          : String(err)
      )
    } finally {
      setSyncing(false)
    }
  }

  async function runImport() {
    if (!fileName) return

    if (!requiredMappingsComplete) {
      setError(
        `Map all required fields before importing: ${requiredFields
          .map(field => labels[field])
          .join(', ')}.`
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

    try {
      const rpcName =
        importType === 'catalog'
          ? 'import_agency_items'
          : 'import_bid_history'

      const parameters =
        importType === 'catalog'
          ? {
              p_source_abbreviation: importSource,
              p_filename: fileName,
              p_items: validRows,
            }
          : {
              p_source_abbreviation: importSource,
              p_filename: fileName,
              p_rows: validRows,
            }

      const {
        data,
        error: importError,
      } = await supabase.rpc(
        rpcName,
        parameters
      )

      if (importError) {
        throw new Error(importError.message)
      }

      setImportResult(data as ImportResult)

      await loadData()
    } catch (err) {
      console.error('Import error:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Import failed.'
      )
    } finally {
      setImporting(false)
    }
  }
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1>Items</h1>

          <p style={{ opacity: 0.7 }}>
            Universal bid item library and historical
            pricing intelligence.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => void syncNJDOT()}
            disabled={syncing}
          >
            {syncing
              ? 'Syncing NJDOT...'
              : 'Sync NJDOT'}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowImport(current => !current)
              setError('')
            }}
          >
            {showImport
              ? 'Close Import'
              : 'Import Data'}
          </button>
        </div>
      </div>

      {(syncing || syncResult || syncError) && (
        <div
          className="card"
          style={{
            marginTop: 16,
            marginBottom: 20,
          }}
        >
          <h2>NJDOT Data Sync</h2>

          {syncing && (
            <>
              <p>
                <strong>
                  Connecting to NJDOT...
                </strong>
              </p>

              <p style={{ opacity: 0.7 }}>
                CivilBid is checking NJDOT's FY2026
                awarded projects for bid tabulations.
              </p>
            </>
          )}

          {syncError && (
            <>
              <p>
                <strong>Sync failed</strong>
              </p>

              <div
                style={{
                  padding: 12,
                  border: '1px solid currentColor',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {syncError}
              </div>
            </>
          )}

          {syncResult && (
            <>
              <p>
                <strong>Sync complete</strong>
              </p>

              <p>
                Bid tabulations discovered:{' '}
                <strong>
                  {syncResult.bid_tabulations_discovered ?? 0}
                </strong>
              </p>

              <p>
                New documents:{' '}
                <strong>
                  {syncResult.new_documents ?? 0}
                </strong>
              </p>

              <p>
                Already known:{' '}
                <strong>
                  {syncResult.existing_documents ?? 0}
                </strong>
              </p>

              <p>
                Failed:{' '}
                <strong>
                  {syncResult.failed_documents ?? 0}
                </strong>
              </p>

              {syncResult.sync_run_id && (
                <p
                  style={{
                    opacity: 0.65,
                    fontSize: 13,
                  }}
                >
                  Sync run: {syncResult.sync_run_id}
                </p>
              )}

              {syncResult.message && (
                <p style={{ opacity: 0.7 }}>
                  {syncResult.message}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {showImport && (
        <div
          className="card"
          style={{
            marginTop: 16,
            marginBottom: 20,
          }}
        >
          <h2>Import Data</h2>

          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              marginTop: 18,
            }}
          >
            <div>
              <label>
                <strong>Import Type</strong>
              </label>

              <br />

              <select
                value={importType}
                onChange={e =>
                  changeImportType(
                    e.target.value as ImportType
                  )
                }
                style={{ marginTop: 6 }}
              >
                <option value="catalog">
                  Item Catalog
                </option>

                <option value="bid_history">
                  Historical Bid Results
                </option>
              </select>
            </div>

            <div>
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
          </div>

          <div style={{ marginTop: 18 }}>
            <label>
              <strong>
                {importType === 'catalog'
                  ? 'Catalog File'
                  : 'Historical Bid File'}
              </strong>
            </label>

            <br />

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e =>
                void handleFile(e.target.files?.[0])
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
                CivilBid automatically mapped recognized
                columns. Review them before importing.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit,minmax(220px,1fr))',
                  gap: 14,
                }}
              >
                {fields.map(field => (
                  <div key={field}>
                    <label>
                      <strong>
                        {labels[field]}
                        {requiredFields.includes(field)
                          ? ' *'
                          : ''}
                      </strong>
                    </label>

                    <br />

                    <select
                      value={mapping[field] || ''}
                      onChange={e =>
                        updateMapping(
                          field,
                          e.target.value
                        )
                      }
                      style={{
                        width: '100%',
                        marginTop: 6,
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
                Required:{' '}
                {requiredFields
                  .map(field => labels[field])
                  .join(', ')}
              </p>
            </div>
          )}

          {mappedRows.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <h3>Preview</h3>

              <p style={{ opacity: 0.7 }}>
                Showing first 10 rows.
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      {fields.map(field => (
                        <th key={field}>
                          {labels[field]}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {mappedRows
                      .slice(0, 10)
                      .map((row, index) => (
                        <tr key={index}>
                          {fields.map(field => (
                            <td key={field}>
                              {row[field] ||
                                (requiredFields.includes(
                                  field
                                )
                                  ? '⚠'
                                  : '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => void runImport()}
                disabled={
                  importing ||
                  !requiredMappingsComplete ||
                  validRows.length === 0
                }
                style={{ marginTop: 18 }}
              >
                {importing
                  ? 'Importing...'
                  : importType === 'catalog'
                  ? `Import ${validRows.length.toLocaleString()} Items`
                  : `Import ${validRows.length.toLocaleString()} Historical Prices`}
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 18,
                padding: 12,
                border: '1px solid currentColor',
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

              {importResult.updated !== undefined && (
                <p>
                  <strong>Updated:</strong>{' '}
                  {importResult.updated.toLocaleString()}
                </p>
              )}

              <p>
                <strong>New:</strong>{' '}
                {importResult.inserted.toLocaleString()}
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
            marginBottom: 20,
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
              {filteredItems.length.toLocaleString()}{' '}
              items
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
                          ?.abbreviation || 'Company'}
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

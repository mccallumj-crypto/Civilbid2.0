'use client'

import { useEffect, useMemo, useState } from 'react'
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
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [{ data: itemData }, { data: sourceData }] = await Promise.all([
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

  function parseCSVLine(line: string) {
    const values: string[] = []
    let current = ''
    let insideQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          insideQuotes = !insideQuotes
        }
      } else if (char === ',' && !insideQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    values.push(current.trim())

    return values
  }

  async function handleFile(file: File | undefined) {
    if (!file) return

    setError('')
    setImportResult(null)
    setFileName(file.name)

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Importer v1 currently accepts CSV files. XLSX support will be added next.')
      setImportRows([])
      return
    }

    const text = await file.text()

    const lines = text
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)

    if (lines.length < 2) {
      setError('The CSV does not contain any data rows.')
      return
    }

    const headers = parseCSVLine(lines[0]).map(header =>
      header
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
    )

    const aliases: Record<string, string[]> = {
      item_number: [
        'item_number',
        'item_no',
        'item',
        'pay_item',
        'pay_item_number',
        'item_code'
      ],

      description: [
        'description',
        'item_description',
        'pay_item_description'
      ],

      unit: [
        'unit',
        'unit_of_measure',
        'uom'
      ],

      specification_section: [
        'specification_section',
        'spec_section',
        'section'
      ],

      specification_year: [
        'specification_year',
        'spec_year'
      ],

      item_class: [
        'item_class',
        'class'
      ],

      standard_status: [
        'standard_status',
        'status'
      ]
    }

    function getColumn(row: string[], field: string) {
      const possibleNames = aliases[field] || []

      for (const name of possibleNames) {
        const index = headers.indexOf(name)

        if (index >= 0) {
          return row[index] || ''
        }
      }

      return ''
    }

    const rows: ImportRow[] = lines.slice(1).map(line => {
      const row = parseCSVLine(line)

      return {
        item_number: getColumn(row, 'item_number'),
        description: getColumn(row, 'description'),
        unit: getColumn(row, 'unit'),
        specification_section: getColumn(row, 'specification_section'),
        specification_year: getColumn(row, 'specification_year'),
        item_class: getColumn(row, 'item_class'),
        standard_status:
          getColumn(row, 'standard_status') || 'unknown'
      }
    })

    setImportRows(rows)
  }

  async function runImport() {
    if (!fileName || importRows.length === 0) return

    setImporting(true)
    setError('')
    setImportResult(null)

    const { data, error: importError } = await supabase.rpc(
      'import_agency_items',
      {
        p_source_abbreviation: importSource,
        p_filename: fileName,
        p_items: importRows
      }
    )

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
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Import Item Catalog</h2>

          <p style={{ opacity: 0.7 }}>
            Import or update an agency item catalog. Existing item
            numbers for the selected source will be updated instead
            of duplicated.
          </p>

          <div style={{ marginTop: 18 }}>
            <label>
              <strong>Source</strong>
            </label>

            <br />

            <select
              value={importSource}
              onChange={e => setImportSource(e.target.value)}
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
              <strong>CSV File</strong>
            </label>

            <br />

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => handleFile(e.target.files?.[0])}
              style={{ marginTop: 6 }}
            />
          </div>

          {error && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                border: '1px solid currentColor'
              }}
            >
              {error}
            </div>
          )}

          {importRows.length > 0 && (
            <>
              <div style={{ marginTop: 22 }}>
                <strong>Preview</strong>

                <p style={{ opacity: 0.7 }}>
                  {importRows.length.toLocaleString()} records detected.
                  Showing the first 10.
                </p>
              </div>

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
                    {importRows.slice(0, 10).map((row, index) => (
                      <tr key={`${row.item_number}-${index}`}>
                        <td>{row.item_number}</td>
                        <td>{row.description}</td>
                        <td>{row.unit}</td>
                        <td>{row.specification_section}</td>
                        <td>{row.specification_year}</td>
                        <td>{row.item_class}</td>
                        <td>{row.standard_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={runImport}
                disabled={importing}
                style={{ marginTop: 18 }}
              >
                {importing
                  ? 'Importing...'
                  : `Import ${importRows.length.toLocaleString()} Items`}
              </button>
            </>
          )}

          {importResult && (
            <div className="card" style={{ marginTop: 20 }}>
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
            onChange={e => setSearch(e.target.value)}
            placeholder="Search item number or description..."
            style={{ minWidth: 280 }}
          />

          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
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
                        <strong>{item.item_number}</strong>
                      </td>

                      <td>{item.description}</td>

                      <td>{item.unit}</td>

                      <td>
                        {item.item_sources?.abbreviation || 'Company'}
                      </td>

                      <td>
                        {item.specification_section || '—'}
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

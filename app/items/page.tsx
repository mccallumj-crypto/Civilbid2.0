```tsx
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

type CatalogField =
  | 'item_number'
  | 'description'
  | 'unit'
  | 'specification_section'
  | 'specification_year'
  | 'item_class'
  | 'standard_status'

type BidField =
  | 'item_number'
  | 'description'
  | 'unit'
  | 'contract_number'
  | 'project_name'
  | 'bid_date'
  | 'county'
  | 'region'
  | 'bidder_name'
  | 'bidder_rank'
  | 'is_awarded_bidder'
  | 'quantity'
  | 'unit_price'
  | 'engineer_estimate_unit_price'

type ImportField = CatalogField | BidField

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
  source?: string
  year?: number
  sync_run_id?: string
  bid_tabulations_discovered?: number
  new_documents?: number
  existing_documents?: number
  failed_documents?: number
  message?: string
  error?: string
}

const catalogLabels: Record<CatalogField, string> = {
  item_number: 'Item Number',
  description: 'Description',
  unit: 'Unit',
  specification_section: 'Specification Section',
  specification_year: 'Specification Year',
  item_class: 'Item Class',
  standard_status: 'Standard Status',
}

const bidLabels: Record<BidField, string> = {
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
  const [importSource, setImportSource] =
    useState('NJDOT')

  const [fileName, setFileName] = useState('')
  const [workbook, setWorkbook] =
    useState<XLSX.WorkBook | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] =
    useState<ColumnMap>({})

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

    try {
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
    } finally {
      setLoading(false)
    }
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

  const labels: Record<string, string> =
    importType === 'catalog'
      ? catalogLabels
      : bidLabels

  const fields = Object.keys(labels) as ImportField[]

  const requiredFields: string[] =
    importType === 'catalog'
      ? ['item_number', 'description', 'unit']
      : ['item_number', 'unit_price']

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

    setFileName('')
    setWorkbook(null)
    setSheetName('')
    setRawRows([])
    setHeaders([])
    setMapping({})
    setImportResult(null)
    setError('')
  }

  function loadWorksheet(
    currentWorkbook: XLSX.WorkBook,
    selectedSheet: string
  ) {
    const sheet =
      currentWorkbook.Sheets[selectedSheet]

    if (!sheet) {
      setError(
        'The selected worksheet could not be read.'
      )
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
      new Set(
        rows.flatMap(row => Object.keys(row))
      )
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

  async function handleFile(
    file: File | undefined
  ) {
    if (!file) return

    setError('')
    setImportResult(null)
    setRawRows([])
    setHeaders([])
    setMapping({})
    setFileName(file.name)

    const extension =
      file.name
        .split('.')
        .pop()
        ?.toLowerCase() || ''

    if (
      !['xlsx', 'xls', 'csv'].includes(extension)
    ) {
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

      if (
        parsedWorkbook.SheetNames.length === 0
      ) {
        setError(
          'The uploaded file contains no worksheets.'
        )
        return
      }

      const firstSheet =
        parsedWorkbook.SheetNames[0]

      setWorkbook(parsedWorkbook)
      setSheetName(firstSheet)

      loadWorksheet(
        parsedWorkbook,
        firstSheet
      )
    } catch (err) {
      console.error(
        'Spreadsheet read error:',
        err
      )

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

  function updateMapping(
    field: string,
    column: string
  ) {
    setMapping(current => ({
      ...current,
      [field]: column,
    }))
  }

  function getMappedValue(
    row: RawRow,
    field: string
  ) {
    const column = mapping[field]

    if (!column) return ''

    return valueToString(row[column])
  }

  const mappedRows = useMemo(() => {
    return rawRows.map(row => {
      const mapped: Record<string, string> = {}

      fields.forEach(field => {
        mapped[field] =
          getMappedValue(row, field)
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
      console.log(
        'CivilBid: invoking sync-njdot...'
      )

      const {
        data,
        error: functionError,
      } = await supabase.functions.invoke(
        'sync-njdot',
        {
          body: {},
        }
      )

      console.log(
        'CivilBid: sync-njdot response:',
        {
          data,
          functionError,
        }
      )

      if (functionError) {
        throw new Error(
          functionError.message ||
            'The NJDOT Edge Function failed.'
        )
      }

      const result =
        data as SyncResult | null

      if (!result) {
        throw new Error(
          'The NJDOT Edge Function returned no data.'
        )
      }

      if (!result.success) {
        throw new
```

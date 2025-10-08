import axios from 'axios'

const MAGENTO_BASE_URL = process.env.MAGENTO_BASE_URL

async function getOrdersByDateRange(token, fromDate, toDate) {
  // Use UTC dates for consistent API calls
  const fromDateStr = `${fromDate.getUTCFullYear()}-${(fromDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${fromDate.getUTCDate().toString().padStart(2, '0')} 00:00:00`
  const toDateStr = `${toDate.getUTCFullYear()}-${(toDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${toDate.getUTCDate().toString().padStart(2, '0')} 23:59:59`
  
  console.log(`API Date filter: ${fromDateStr} to ${toDateStr}`)
  
  let url = `${MAGENTO_BASE_URL}/orders?searchCriteria[pageSize]=100`
  url += `&searchCriteria[filterGroups][0][filters][0][field]=created_at`
  url += `&searchCriteria[filterGroups][0][filters][0][value]=${fromDateStr}`
  url += `&searchCriteria[filterGroups][0][filters][0][conditionType]=gteq`
  url += `&searchCriteria[filterGroups][1][filters][0][field]=created_at`
  url += `&searchCriteria[filterGroups][1][filters][0][value]=${toDateStr}`
  url += `&searchCriteria[filterGroups][1][filters][0][conditionType]=lteq`

  try {
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    return response.data.items || []
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message)
    throw new Error(`API request failed: ${error.response?.status} - ${error.response?.statusText || error.message}`)
  }
}

async function getOrderItems(token, orderId) {
  try {
    const response = await axios.get(`${MAGENTO_BASE_URL}/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    return response.data.items || []
  } catch (error) {
    console.error(`Error fetching order ${orderId}:`, error.response?.data || error.message)
    return []
  }
}

async function getProductHSN(token, sku) {
  try {
    const response = await axios.get(`${MAGENTO_BASE_URL}/products/${sku}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 5000 // 5 second timeout
    })
    
    const customAttrs = response.data.custom_attributes || []
    const hsnAttr = customAttrs.find(attr => attr.attribute_code === 'hsncode')
    return hsnAttr?.value || 'N/A'
  } catch (error) {
    console.log(`HSN fetch failed for SKU ${sku}:`, error.message)
    return 'N/A'
  }
}

async function generateHSNDetails(token, fromDate, toDate) {
  const orders = await getOrdersByDateRange(token, fromDate, toDate)
  const hsnSummary = {}
  let totalValue = 0, totalTax = 0
  const hsnCache = {} // Cache HSN codes to avoid duplicate API calls

  for (const order of orders) {
    const orderId = order.increment_id || order.entity_id
    const orderItems = await getOrderItems(token, orderId)
    
    for (const item of orderItems) {
      const sku = item.sku || ''
      const qty = parseFloat(item.qty_ordered || 0)
      const taxAmount = parseFloat(item.tax_amount || 0)
      const rowTotal = parseFloat(item.row_total || 0)
      
      if (qty <= 0) continue
      
      // Get HSN code with caching
      let hsnCode
      if (hsnCache[sku]) {
        hsnCode = hsnCache[sku]
      } else {
        hsnCode = await getProductHSN(token, sku)
        hsnCache[sku] = hsnCode
      }
      
      let taxRate = parseFloat(item.tax_percent || 0)
      
      if (!taxRate && taxAmount > 0 && rowTotal > 0) {
        const taxableAmount = rowTotal - taxAmount
        if (taxableAmount > 0) {
          taxRate = (taxAmount / taxableAmount) * 100
          if (taxRate <= 2.5) taxRate = 0
          else if (taxRate <= 7.5) taxRate = 5
          else if (taxRate <= 15) taxRate = 12
          else if (taxRate <= 21) taxRate = 18
          else taxRate = 28
        }
      }
      
      const taxableValue = rowTotal - taxAmount
      const cgstAmount = taxAmount / 2
      const sgstAmount = taxAmount / 2
      const hsnRateKey = `${hsnCode}_${Math.round(taxRate)}`
      
      if (!hsnSummary[hsnRateKey]) {
        hsnSummary[hsnRateKey] = {
          hsn_code: hsnCode,
          description: hsnCode === 'N/A' ? 'General Items' : hsnCode,
          uqc: 'NOS-Numbers',
          total_quantity: 0,
          total_value: 0,
          taxable_value: 0,
          integrated_tax_amount: 0,
          central_tax_amount: 0,
          state_ut_tax_amount: 0,
          cess_amount: 0,
          rate: taxRate
        }
      }
      
      hsnSummary[hsnRateKey].total_quantity += qty
      hsnSummary[hsnRateKey].total_value += rowTotal
      hsnSummary[hsnRateKey].taxable_value += taxableValue
      hsnSummary[hsnRateKey].central_tax_amount += cgstAmount
      hsnSummary[hsnRateKey].state_ut_tax_amount += sgstAmount
      
      totalValue += rowTotal
      totalTax += taxAmount
    }
  }
  
  return {
    hsn_details: Object.values(hsnSummary),
    total_orders: orders.length,
    total_value: totalValue,
    total_tax: totalTax
  }
}

async function generateB2CSupplies(token, fromDate, toDate) {
  const orders = await getOrdersByDateRange(token, fromDate, toDate)
  const productSummary = {}
  let totalValue = 0, totalTax = 0

  for (const order of orders) {
    const orderId = order.increment_id || order.entity_id
    const orderItems = await getOrderItems(token, orderId)
    
    for (const item of orderItems) {
      const sku = item.sku || ''
      const productName = item.name || sku
      const qty = parseFloat(item.qty_ordered || 0)
      const taxAmount = parseFloat(item.tax_amount || 0)
      const rowTotal = parseFloat(item.row_total || 0)
      
      if (qty <= 0) continue
      
      let taxRate = parseFloat(item.tax_percent || 0)
      if (!taxRate && taxAmount > 0 && rowTotal > 0) {
        const taxableAmount = rowTotal - taxAmount
        if (taxableAmount > 0) {
          taxRate = (taxAmount / taxableAmount) * 100
          if (taxRate <= 2.5) taxRate = 0
          else if (taxRate <= 7.5) taxRate = 5
          else if (taxRate <= 15) taxRate = 12
          else if (taxRate <= 21) taxRate = 18
          else taxRate = 28
        }
      }
      
      const taxableValue = rowTotal - taxAmount
      const cgstAmount = taxAmount / 2
      const sgstAmount = taxAmount / 2
      const productKey = `${sku}_${Math.round(taxRate)}`
      
      if (!productSummary[productKey]) {
        productSummary[productKey] = {
          product_name: productName,
          sku: sku,
          tax_rate: taxRate,
          quantity: 0,
          taxable_value: 0,
          cgst_amount: 0,
          sgst_amount: 0,
          total_tax: 0,
          total_value: 0
        }
      }
      
      productSummary[productKey].quantity += qty
      productSummary[productKey].taxable_value += taxableValue
      productSummary[productKey].cgst_amount += cgstAmount
      productSummary[productKey].sgst_amount += sgstAmount
      productSummary[productKey].total_tax += taxAmount
      productSummary[productKey].total_value += rowTotal
      
      totalValue += rowTotal
      totalTax += taxAmount
    }
  }
  
  return {
    b2c_supplies: Object.values(productSummary),
    total_orders: orders.length,
    total_value: totalValue,
    total_tax: totalTax
  }
}

async function generateB2CS(token, fromDate, toDate) {
  const orders = await getOrdersByDateRange(token, fromDate, toDate)
  const b2csGrouped = {}
  
  for (const order of orders) {
    const orderTotal = parseFloat(order.grand_total || 0)
    const orderTax = parseFloat(order.tax_amount || 0)
    
    let taxRate = 0
    if (orderTax > 0 && orderTotal > 0) {
      const taxableAmount = orderTotal - orderTax
      if (taxableAmount > 0) {
        taxRate = (orderTax / taxableAmount) * 100
        if (taxRate <= 2.5) taxRate = 0
        else if (taxRate <= 7.5) taxRate = 5
        else if (taxRate <= 15) taxRate = 12
        else if (taxRate <= 21) taxRate = 18
        else taxRate = 28
      }
    }
    
    const taxableValue = orderTotal - orderTax
    const rateKey = Math.round(taxRate).toString()
    
    if (!b2csGrouped[rateKey]) {
      b2csGrouped[rateKey] = {
        place_of_supply: '32-KERALA',
        rate: taxRate,
        taxable_value: 0
      }
    }
    
    b2csGrouped[rateKey].taxable_value += taxableValue
  }
  
  return { b2cs: Object.values(b2csGrouped) }
}

async function generateDocuments(token, fromDate, toDate) {
  const orders = await getOrdersByDateRange(token, fromDate, toDate)
  
  if (orders.length === 0) {
    return {
      documents: {
        sr_no_from: '',
        sr_no_to: '',
        total_number: 0,
        cancelled: 0
      }
    }
  }
  
  const orderNumbers = []
  let cancelledCount = 0
  
  for (const order of orders) {
    const orderNumber = order.increment_id
    const status = order.status || ''
    const orderDate = new Date(order.created_at)
    
    // Double check the order is within date range (convert to UTC for comparison)
    if (orderNumber && orderDate >= fromDate && orderDate <= toDate) {
      orderNumbers.push(parseInt(orderNumber))
      if (status.toLowerCase().includes('cancel')) {
        cancelledCount++
      }
    }
  }
  
  // Sort numerically instead of alphabetically
  orderNumbers.sort((a, b) => a - b)
  
  return {
    documents: {
      sr_no_from: orderNumbers.length > 0 ? orderNumbers[0].toString().padStart(9, '0') : '',
      sr_no_to: orderNumbers.length > 0 ? orderNumbers[orderNumbers.length - 1].toString().padStart(9, '0') : '',
      total_number: orderNumbers.length,
      cancelled: cancelledCount
    }
  }
}

function generateCSV(data, reportType) {
  let csvContent = ''
  let filename = ''
  
  if (reportType === 'HSN Details') {
    csvContent = 'HSN,Description,UQC,Total Quantity,Total Value,Taxable Value,Integrated Tax Amount,Central Tax Amount,State/UT Tax Amount,Cess Amount,Rate\n'
    data.hsn_details.forEach(hsn => {
      csvContent += `${hsn.hsn_code},${hsn.description},${hsn.uqc},${hsn.total_quantity.toFixed(0)},${hsn.total_value.toFixed(2)},${hsn.taxable_value.toFixed(2)},${hsn.integrated_tax_amount.toFixed(0)},${hsn.central_tax_amount.toFixed(2)},${hsn.state_ut_tax_amount.toFixed(2)},${hsn.cess_amount.toFixed(0)},${hsn.rate.toFixed(0)}\n`
    })
    filename = `hsn_detailed_report_${new Date().getTime()}.csv`
  } else if (reportType === 'B2C Supplies') {
    csvContent = 'Product Name,SKU,Tax Rate,Quantity,Taxable Value,CGST Amount,SGST Amount,Total Tax,Total Value\n'
    data.b2c_supplies.forEach(supply => {
      csvContent += `${supply.product_name},${supply.sku},${supply.tax_rate.toFixed(0)},${supply.quantity.toFixed(0)},${supply.taxable_value.toFixed(2)},${supply.cgst_amount.toFixed(2)},${supply.sgst_amount.toFixed(2)},${supply.total_tax.toFixed(2)},${supply.total_value.toFixed(2)}\n`
    })
    filename = `b2c_supplies_report_${new Date().getTime()}.csv`
  } else if (reportType === 'B2CS') {
    csvContent = 'Type,Place Of Supply,Rate,Taxable Value,Cess Amount,E-Commerce GSTIN\n'
    data.b2cs.forEach(b2cs => {
      csvContent += `OE,${b2cs.place_of_supply},${b2cs.rate.toFixed(0)},${b2cs.taxable_value.toFixed(1)},0,\n`
    })
    filename = `b2cs_report_${new Date().getTime()}.csv`
  } else if (reportType === 'Documents') {
    csvContent = 'Nature of Document,Sr. No. From,Sr. No. To,Total Number,Cancelled\n'
    csvContent += `Invoice for outward supply,${data.documents.sr_no_from},${data.documents.sr_no_to},${data.documents.total_number},${data.documents.cancelled}\n`
    filename = `documents_report_${new Date().getTime()}.csv`
  }
  
  return { csvContent, filename }
}

function generateHTML(data, reportType) {
  if (reportType === 'HSN Details') {
    let html = '<table class="min-w-full border border-gray-300"><thead class="bg-gray-50"><tr>'
    html += '<th class="border border-gray-300 px-4 py-2">HSN</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Description</th>'
    html += '<th class="border border-gray-300 px-4 py-2">UQC</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Total Quantity</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Total Value</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Taxable Value</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Central Tax Amount</th>'
    html += '<th class="border border-gray-300 px-4 py-2">State/UT Tax Amount</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Rate</th>'
    html += '</tr></thead><tbody>'
    
    data.hsn_details.forEach(hsn => {
      html += '<tr>'
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.hsn_code}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.description}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.uqc}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.total_quantity.toFixed(0)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.total_value.toFixed(2)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.taxable_value.toFixed(2)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.central_tax_amount.toFixed(2)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.state_ut_tax_amount.toFixed(2)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${hsn.rate.toFixed(0)}</td>`
      html += '</tr>'
    })
    html += '</tbody></table>'
    return html
  }
  
  if (reportType === 'B2C Supplies') {
    let html = '<table class="min-w-full border border-gray-300"><thead class="bg-gray-50"><tr>'
    html += '<th class="border border-gray-300 px-4 py-2">Product Name</th>'
    html += '<th class="border border-gray-300 px-4 py-2">SKU</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Tax Rate</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Quantity</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Taxable Value</th>'
    html += '<th class="border border-gray-300 px-4 py-2">CGST Amount</th>'
    html += '<th class="border border-gray-300 px-4 py-2">SGST Amount</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Total Value</th>'
    html += '</tr></thead><tbody>'
    
    data.b2c_supplies.forEach(supply => {
      html += '<tr>'
      html += `<td class="border border-gray-300 px-4 py-2">${supply.product_name}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${supply.sku}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${supply.tax_rate.toFixed(0)}%</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${supply.quantity.toFixed(0)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">₹${supply.taxable_value.toFixed(2)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">₹${supply.cgst_amount.toFixed(2)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">₹${supply.sgst_amount.toFixed(2)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">₹${supply.total_value.toFixed(2)}</td>`
      html += '</tr>'
    })
    html += '</tbody></table>'
    return html
  }
  
  if (reportType === 'B2CS') {
    let html = '<table class="min-w-full border border-gray-300"><thead class="bg-gray-50"><tr>'
    html += '<th class="border border-gray-300 px-4 py-2">Type</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Place Of Supply</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Rate</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Taxable Value</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Cess Amount</th>'
    html += '<th class="border border-gray-300 px-4 py-2">E-Commerce GSTIN</th>'
    html += '</tr></thead><tbody>'
    
    data.b2cs.forEach(b2cs => {
      html += '<tr>'
      html += `<td class="border border-gray-300 px-4 py-2">OE</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${b2cs.place_of_supply}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${b2cs.rate.toFixed(0)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">${b2cs.taxable_value.toFixed(1)}</td>`
      html += `<td class="border border-gray-300 px-4 py-2">0</td>`
      html += `<td class="border border-gray-300 px-4 py-2"></td>`
      html += '</tr>'
    })
    html += '</tbody></table>'
    return html
  }
  
  if (reportType === 'Documents') {
    let html = '<table class="min-w-full border border-gray-300"><thead class="bg-gray-50"><tr>'
    html += '<th class="border border-gray-300 px-4 py-2">Nature of Document</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Sr. No. From</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Sr. No. To</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Total Number</th>'
    html += '<th class="border border-gray-300 px-4 py-2">Cancelled</th>'
    html += '</tr></thead><tbody>'
    
    html += '<tr>'
    html += `<td class="border border-gray-300 px-4 py-2">Invoice for outward supply</td>`
    html += `<td class="border border-gray-300 px-4 py-2">${data.documents.sr_no_from}</td>`
    html += `<td class="border border-gray-300 px-4 py-2">${data.documents.sr_no_to}</td>`
    html += `<td class="border border-gray-300 px-4 py-2">${data.documents.total_number}</td>`
    html += `<td class="border border-gray-300 px-4 py-2">${data.documents.cancelled}</td>`
    html += '</tr>'
    
    html += '</tbody></table>'
    return html
  }
  
  return '<p>No data available</p>'
}

import { jobs } from './status.js'

function generateJobId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9)
}

async function processReportInBackground(jobId, reportType, token, fromDate, toDate) {
  try {
    jobs.set(jobId, { status: 'processing', progress: 0 })
    
    let data
    if (reportType === 'HSN Details') {
      data = await generateHSNDetails(token, fromDate, toDate)
    } else if (reportType === 'B2C Supplies') {
      data = await generateB2CSupplies(token, fromDate, toDate)
    } else if (reportType === 'B2CS') {
      data = await generateB2CS(token, fromDate, toDate)
    } else if (reportType === 'Documents') {
      data = await generateDocuments(token, fromDate, toDate)
    }
    
    const { csvContent, filename } = generateCSV(data, reportType)
    const html = generateHTML(data, reportType)
    
    jobs.set(jobId, {
      status: 'completed',
      progress: 100,
      data: {
        csv: csvContent,
        filename: filename,
        html: html,
        reportData: data
      }
    })
  } catch (error) {
    jobs.set(jobId, {
      status: 'failed',
      error: error.message
    })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { reportType, month, year } = req.body
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' })
  }

  try {
    // Create dates in UTC to avoid timezone issues
    const fromDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
    const toDate = new Date(Date.UTC(year, month, 0, 23, 59, 59))
    
    console.log(`Date range: ${fromDate.toISOString()} to ${toDate.toISOString()}`)
    
    // For HSN Details, use background processing
    if (reportType === 'HSN Details') {
      const jobId = generateJobId()
      
      // Start background processing
      processReportInBackground(jobId, reportType, token, fromDate, toDate)
      
      return res.status(202).json({
        success: true,
        jobId: jobId,
        message: 'Report generation started. Check status using the job ID.'
      })
    }
    
    // For other reports, process immediately
    let data
    if (reportType === 'B2C Supplies') {
      data = await generateB2CSupplies(token, fromDate, toDate)
    } else if (reportType === 'B2CS') {
      data = await generateB2CS(token, fromDate, toDate)
    } else if (reportType === 'Documents') {
      data = await generateDocuments(token, fromDate, toDate)
    } else {
      return res.status(400).json({ success: false, message: 'Invalid report type' })
    }
    
    const { csvContent, filename } = generateCSV(data, reportType)
    const html = generateHTML(data, reportType)
    
    res.status(200).json({
      success: true,
      data: {
        csv: csvContent,
        filename: filename,
        html: html,
        reportData: data
      }
    })
    
  } catch (error) {
    console.error('Report generation error:', error)
    
    if (error.message.includes('401')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Please login again.'
      })
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate report: ' + error.message
    })
  }
}
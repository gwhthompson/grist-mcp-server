#!/usr/bin/env node
import axios from 'axios'

const baseURL = 'http://localhost:8989/api'
const apiKey = 'test_api_key'
const docId = 'qBbArddFDSrKd2jpv3uZTj'

async function testDirectAPI() {
  const client = axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  })

  console.log('Test 1: No filter')
  try {
    const r1 = await client.get(`/docs/${docId}/tables/Contacts/records`, {
      params: { limit: 2 }
    })
    console.log('✅ Success:', r1.data.records.length, 'records\n')
  } catch (e: any) {
    console.log('❌ Failed:', e.response?.status, e.message, '\n')
  }

  console.log('Test 2: Filter as JSON STRING')
  try {
    const r2 = await client.get(`/docs/${docId}/tables/Contacts/records`, {
      params: {
        limit: 2,
        filter: JSON.stringify({ Status: 'Active' })
      }
    })
    console.log('✅ Success:', r2.data.records.length, 'records\n')
  } catch (e: any) {
    console.log('❌ Failed:', e.response?.status, e.message, '\n')
  }

  console.log('Test 3: Filter as URL-encoded JSON')
  try {
    const r3 = await client.get(
      `/docs/${docId}/tables/Contacts/records?limit=2&filter=${encodeURIComponent(JSON.stringify({ Status: 'Active' }))}`
    )
    console.log('✅ Success:', r3.data.records.length, 'records\n')
  } catch (e: any) {
    console.log('❌ Failed:', e.response?.status, e.message, '\n')
  }

  console.log('Test 4: Check Grist docs for correct format')
  console.log('According to Grist docs, filter should be a JSON object in query params')
}

testDirectAPI()

import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const alt = 'Secure Cleaning available cleaning contracts'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'

export default async function JobsOpenGraphImage() {
  const logo = await readFile(path.join(process.cwd(), 'public', 'secure-cleaning-logo-aug26.png'))
  const logoData = `data:image/png;base64,${logo.toString('base64')}`

  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#10213f',
        color: 'white',
        display: 'flex',
        fontFamily: 'Arial, sans-serif',
        height: '100%',
        justifyContent: 'space-between',
        padding: '64px',
        width: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: 'white',
          borderRadius: '28px',
          display: 'flex',
          height: '390px',
          justifyContent: 'center',
          padding: '34px',
          width: '440px',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Secure Cleaning" height="294" src={logoData} width="441" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '58px', width: '570px' }}>
        <div
          style={{
            color: '#6ee7b7',
            display: 'flex',
            fontSize: '28px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Secure Cleaning
        </div>
        <div style={{ display: 'flex', fontSize: '62px', fontWeight: 800, lineHeight: 1.05, marginTop: '24px' }}>
          Available cleaning contracts
        </div>
        <div style={{ color: '#d7e0ed', display: 'flex', fontSize: '28px', lineHeight: 1.35, marginTop: '28px' }}>
          Commercial cleaning opportunities for professional cleaners.
        </div>
      </div>
    </div>,
    size,
  )
}

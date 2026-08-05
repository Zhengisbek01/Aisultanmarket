import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
]

export default function BarcodeScanner({ onScan, onClose }) {
  const regionId = 'barcode-scan-region'
  const scannerRef = useRef(null)
  const [tip, setTip] = useState('Наведите камеру на штрих-код')

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId, {
      formatsToSupport: BARCODE_FORMATS,
      verbose: false,
    })
    scannerRef.current = scanner
    let stopped = false
    let attempts = 0

    Html5Qrcode.getCameras()
      .then(cameras => {
        if (!cameras || !cameras.length) throw new Error('no-camera')
        const backCam = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1]
        return scanner.start(
          backCam.id,
          {
            fps: 15,
            qrbox: { width: 320, height: 180 },
            aspectRatio: 1.6,
            disableFlip: false,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          },
          (decodedText) => {
            if (stopped) return
            stopped = true
            onScan(decodedText)
          },
          () => {
            attempts += 1
            if (attempts === 60) {
              setTip('Не получается распознать: отодвиньте товар на 15–20 см, держите ровно и при хорошем свете, избегайте бликов на упаковке')
            }
          }
        )
      })
      .catch(() => {
        onScan(null, 'Камера недоступна. Проверьте разрешение доступа к камере в браузере.')
      })

    return () => {
      stopped = true
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => {})
      }
    }
  }, [])

  return (
    <div className="scanner-overlay">
      <div className="scanner-box">
        <div id={regionId} className="scanner-region" />
        <p className="hint" style={{ textAlign: 'center' }}>{tip}</p>
        <button className="btn btn-secondary" onClick={onClose}>Закрыть камеру</button>
      </div>
    </div>
  )
}

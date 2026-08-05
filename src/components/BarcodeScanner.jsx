import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function BarcodeScanner({ onScan, onClose }) {
  const regionId = 'barcode-scan-region'
  const scannerRef = useRef(null)

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId)
    scannerRef.current = scanner
    let stopped = false

    Html5Qrcode.getCameras()
      .then(cameras => {
        if (!cameras || !cameras.length) throw new Error('no-camera')
        const backCam = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1]
        return scanner.start(
          backCam.id,
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decodedText) => {
            if (stopped) return
            stopped = true
            onScan(decodedText)
          },
          () => {}
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
        <button className="btn btn-secondary" onClick={onClose}>Закрыть камеру</button>
      </div>
    </div>
  )
}

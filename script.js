const filePicker = document.getElementById('file')
const encoding = '<?xml version="1.0" encoding="utf-8"?>'
const tl = encoding.length

let to_dl = null, to_dl_fname = null

filePicker.addEventListener('change', (e) => {
  const selectedFile = e.target.files[0]

  document.getElementById('sys-error').style.display = 'none'
  document.getElementById('has-error').style.display = 'none'
  document.getElementById('no-error').style.display = 'none'

  processEPUB(selectedFile, selectedFile.name)
})

async function processEPUB (blob, name) {
  const reader = new zip.ZipReader(new zip.BlobReader(blob))
  const blobWriter = new zip.BlobWriter('application/epub+zip')
  const writer = new zip.ZipWriter(blobWriter, { extendedTimestamp: false })

  try {
    const entries = await reader.getEntries()
    let has_error = false
    for (const entry of entries) {
      const ext = entry.filename.split('.').pop()
      if (ext === 'xhtml') {
        let html = await entry.getData(new zip.TextWriter('utf-8'))
        html = html.trimStart()
        if (html.substring(0, tl).toLowerCase() !== encoding) {
          html = encoding + '\n' + html
          has_error = true
        }
        await writer.add(entry.filename, new zip.TextReader(html))
      } else {
        const fileBlob = await entry.getData(new zip.Uint8ArrayWriter())
        await writer.add(entry.filename, new zip.Uint8ArrayReader(fileBlob), {
          level: entry.filename === 'mimetype' ? 0 : 5
        })
      }
    }

    await writer.close()
    if (has_error) {
      to_dl = blobWriter.getData()
      to_dl_fname = name
      document.getElementById('has-error').style.display = 'block'
    } else {
      to_dl = null
      document.getElementById('no-error').style.display = 'block'
    }
  } catch (e) {
    console.error(e)
    document.getElementById('sys-error').style.display = 'block'
  }
}

document.getElementById('btn').addEventListener('click', () => {
  if (to_dl) {
    saveAs(to_dl, to_dl_fname)
  }
})


const TXT_PROCESSING = 'Processing...'
const TXT_NO_ERROR = 'No errors detected. Perhaps there are other errors?<br>Output file is available for download anyway.'
const TXT_SYS_ERROR = 'The program encountered an internal error.'

const statusDiv = document.getElementById('status')
const downloadBtn = document.getElementById('btn')
function setStatus(type) {
  if (type === '') {
    statusDiv.style.display = 'none'
    downloadBtn.style.display = 'none'
  } else {
    statusDiv.style.display = 'block'
    if (type === TXT_PROCESSING) {
      statusDiv.innerHTML = type
      statusDiv.style.color = 'blue'
    } else if (type === TXT_NO_ERROR) {
      statusDiv.innerHTML = type
      statusDiv.style.color = 'blue'
      downloadBtn.style.display = 'block'
    } else if (type === TXT_SYS_ERROR) {
      statusDiv.innerHTML = type
      statusDiv.style.color = 'red'
    } else {
      statusDiv.innerHTML = `<ul class="scroll">${type.map(x => `<li>${x}</li>`).join('')}</ul>`
      statusDiv.style.color = 'green'
      downloadBtn.style.display = 'block'
    }
  }
}

function basename(path) {
  return path.split('/').pop()
}

class EPUBBook {
  fixedProblems = []

  // Add UTF-8 encoding declaration if missing
  fixEncoding() {
    const encoding = '<?xml version="1.0" encoding="utf-8"?>'
    const regex = /^<\?xml\s+version=["'][\d.]+["']\s+encoding=["'][a-zA-Z\d-.]+["']\s*\?>/i

    for (const filename in this.files) {
      const ext = filename.split('.').pop()
      if (ext === 'html' || ext === 'xhtml') {
        let html = this.files[filename]
        html = html.trimStart()
        if (!regex.test(html)) {
          html = encoding + '\n' + html
          this.fixedProblems.push(`Fixed encoding for file ${filename}`)
        }
        this.files[filename] = html
      }
    }
  }

  // Fix linking to body ID showing up as unresolved hyperlink
  fixBodyIdLink() {
    const bodyIDList = []
    const parser = new DOMParser()

    // Create list of ID tag of <body>
    for (const filename in this.files) {
      const ext = filename.split('.').pop()
      if (ext === 'html' || ext === 'xhtml') {
        let html = this.files[filename]
        const dom = parser.parseFromString(html, 'text/html')
        const bodyID = dom.getElementsByTagName('body')[0].id
        const linkTarget = basename(filename) + '#' + bodyID
        bodyIDList.push([linkTarget, basename(filename)])
      }
    }

    // Replace all
    for (const filename in this.files) {
      for (const [src, target] of bodyIDList) {
        if (this.files[filename].includes(src)) {
          this.files[filename] = this.files[filename].replaceAll(src, target)
          this.fixedProblems.push(`Replaced link target ${src} with ${target} in file ${filename}.`)
        }
      }
    }
  }

  async readEPUB(blob) {
    const reader = new zip.ZipReader(new zip.BlobReader(blob))
    this.entries = await reader.getEntries()
    this.files = {}
    this.binary_files = {}
    for (const entry of this.entries) {
      const filename = entry.filename
      const ext = filename.split('.').pop()
      if (filename === 'mimetype' || ['html', 'xhtml', 'htm', 'xml', 'svg', 'css', 'opf', 'ncx'].includes(ext)) {
        this.files[filename] = await entry.getData(new zip.TextWriter('utf-8'))
      } else {
        this.binary_files[filename] = await entry.getData(new zip.Uint8ArrayWriter())
      }
    }
  }

  async writeEPUB() {
    const blobWriter = new zip.BlobWriter('application/epub+zip')

    // EPUB Zip cannot have extra attributes, so no extended timestamp
    const writer = new zip.ZipWriter(blobWriter, { extendedTimestamp: false })

    // First write mimetype file
    if ('mimetype' in this.files) {
      await writer.add('mimetype', new zip.TextReader(this.files['mimetype']), { level: 0 })
    }

    // Add text file
    for (const file in this.files) {
      if (file === 'mimetype') {
        // We have already add mimetype file
        continue
      }
      await writer.add(file, new zip.TextReader(this.files[file]))
    }

    // Add binary file
    for (const file in this.binary_files) {
      await writer.add(file, new zip.Uint8ArrayReader(this.binary_files[file]))
    }

    // Finalize file
    await writer.close()
    return blobWriter.getData()
  }
}

let fixedBlob = null, filename = null
const filePicker = document.getElementById('file')

filePicker.addEventListener('change', (e) => {
  const selectedFile = e.target.files[0]
  setStatus(TXT_PROCESSING)

  processEPUB(selectedFile, selectedFile.name)
})

async function processEPUB (blob, name) {
  try {
    // Load EPUB
    const epub = new EPUBBook()
    await epub.readEPUB(blob)

    // Run fixing procedure
    epub.fixEncoding()
    epub.fixBodyIdLink()

    // Write EPUB
    fixedBlob = await epub.writeEPUB()
    filename = name

    if (epub.fixedProblems.length > 0) {
      filename =  "(fixed) " + filename
      setStatus(epub.fixedProblems)
    } else {
      filename =  "(repacked) " + filename
      setStatus(TXT_NO_ERROR)
    }
  } catch (e) {
    console.error(e)
    setStatus(TXT_SYS_ERROR)
  }
}

document.getElementById('btn').addEventListener('click', () => {
  if (fixedBlob) {
    saveAs(fixedBlob, filename)
  }
})


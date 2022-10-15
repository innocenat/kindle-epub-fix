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

function simplify_language(lang) {
  return lang.split('-').shift()
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
        if (bodyID.length > 0) {
          const linkTarget = basename(filename) + '#' + bodyID
          bodyIDList.push([linkTarget, basename(filename)])
        }
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

  // Fix language field not defined or not available
  fixBookLanguage() {
    const parser = new DOMParser()

    // From https://kdp.amazon.com/en_US/help/topic/G200673300
    // Retrieved: 2022-Sep-13
    const allowed_languages = [
      // ISO 639-1
      'af', 'gsw', 'ar', 'eu', 'nb', 'br', 'ca', 'zh', 'kw', 'co', 'da', 'nl', 'stq', 'en', 'fi', 'fr', 'fy', 'gl',
      'de', 'gu', 'hi', 'is', 'ga', 'it', 'ja', 'lb', 'mr', 'ml', 'gv', 'frr', 'nb', 'nn', 'pl', 'pt', 'oc', 'rm',
      'sco', 'gd', 'es', 'sv', 'ta', 'cy',

      // ISO 639-2
      'afr', 'ara', 'eus', 'baq', 'nob', 'bre', 'cat', 'zho', 'chi', 'cor', 'cos', 'dan', 'nld', 'dut', 'eng', 'fin',
      'fra', 'fre', 'fry', 'glg', 'deu', 'ger', 'guj', 'hin', 'isl', 'ice', 'gle', 'ita', 'jpn', 'ltz', 'mar', 'mal',
      'glv', 'nor', 'nno', 'por', 'oci', 'roh', 'gla', 'spa', 'swe', 'tam', 'cym', 'wel',
    ]

    // Find OPF file
    if (!('META-INF/container.xml' in this.files)) {
      console.error('Cannot find META-INF/container.xml')
      return
    }
    const meta_inf_str = this.files['META-INF/container.xml']
    const meta_inf = parser.parseFromString(meta_inf_str, 'text/xml')
    let opf_filename = ''
    for (const rootfile of meta_inf.getElementsByTagName('rootfile')) {
      if (rootfile.getAttribute('media-type') === 'application/oebps-package+xml') {
        opf_filename = rootfile.getAttribute('full-path')
      }
    }

    // Read OPF file
    if (!(opf_filename in this.files)) {
      console.error('Cannot find OPF file!')
      return
    }

    const opf_str = this.files[opf_filename]
    try {
      const opf = parser.parseFromString(opf_str, 'text/xml')
      const language_tags = opf.getElementsByTagName('dc:language')
      let language = 'en'
      let original_language = 'undefined'
      if (language_tags.length === 0) {
        language = prompt('E-book does not have language tag. Please specify the language of the book in RFC 5646 format, e.g. en, fr, ja.', 'en') || 'en'
      } else {
        language = language_tags[0].innerHTML
        original_language = language
      }
      if (!allowed_languages.includes(simplify_language(language))) {
        language = prompt(`Language ${language} is not supported by Kindle. Documents may fail to convert. Continue or specify new language of the book in RFC 5646 format, e.g. en, fr, ja.`, language) || language
      }
      if (language_tags.length === 0) {
        const language_tag = opf.createElement('dc:language')
        language_tag.innerHTML = language
        opf.getElementsByTagName('metadata')[0].appendChild(language_tag)
      } else {
        language_tags[0].innerHTML = language
      }
      if (language !== original_language) {
        this.files[opf_filename] = new XMLSerializer().serializeToString(opf)
        this.fixedProblems.push(`Change document language from ${original_language} to ${language}.`)
      }
    } catch (e) {
      console.error(e)
      console.error('Error trying to parse OPF file as XML.')
    }
  }

  fixStrayIMG() {
    const parser = new DOMParser()

    for (const filename in this.files) {
      const ext = filename.split('.').pop()
      if (ext === 'html' || ext === 'xhtml') {
        let html = parser.parseFromString(this.files[filename], ext === 'xhtml' ? 'application/xhtml+xml' : 'text/html')
        let strayImg = []
        for (const img of html.getElementsByTagName('img')) {
          if (!img.getAttribute('src')) {
            strayImg.push(img)
          }
        }
        if (strayImg.length > 0) {
          for (const img of strayImg) {
            img.parentElement.removeChild(img)
          }
          this.fixedProblems.push(`Remove stray image tag(s) in ${filename}`)
          this.files[filename] = new XMLSerializer().serializeToString(html)
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
        // We have already added mimetype file
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
    epub.fixBodyIdLink()
    epub.fixBookLanguage()
    epub.fixStrayIMG()
    epub.fixEncoding()

    // Write EPUB
    fixedBlob = await epub.writeEPUB()
    filename = name

    if (epub.fixedProblems.length > 0) {
      filename =   filename + "(f) "
      setStatus(epub.fixedProblems)
    } else {
      filename =  filename + "(r) "
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


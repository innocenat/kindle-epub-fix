const TXT_PROCESSING = 'Processing...'
const TXT_DONE = 'Finished processing all files.'
const TXT_NO_ERROR = 'No errors detected. Perhaps there are other errors?<br>Output file is available for download anyway.'
const TXT_SYS_ERROR = 'The program encountered an internal error.'

const mainStatusDiv = document.getElementById('main_status')
const outputDiv = document.getElementById('output')
const btnDlAll = document.getElementById('btnDlAll')

const filePicker = document.getElementById('file')

let filenames = [], fixedBlobs = [], dlfilenames = []

function build_output_html(idx, status) {
  const statusDiv = document.createElement('div')
  const dlBtn = document.createElement('button')
  statusDiv.style.margin = '1em 0'
  dlBtn.style.margin = '1em 0'
  dlBtn.innerHTML = 'Download'
  dlBtn.addEventListener('click', () => {
    saveAs(fixedBlobs[idx], dlfilenames[idx])
  })

  let btn = false

  if (status === TXT_NO_ERROR) {
    statusDiv.innerHTML = status
    statusDiv.style.color = 'blue'
    btn = true
  } else if (status === TXT_SYS_ERROR) {
    statusDiv.innerHTML = status
    statusDiv.style.color = 'red'
    btn = false
  } else {
    statusDiv.innerHTML = `<ul class="scroll">${status.map(x => `<li>${x}</li>`).join('')}</ul>`
    statusDiv.style.color = 'green'
    btn = 'block'
  }

  const section = document.createElement('section')
  section.style.margin = '2em 0'
  section.innerHTML = `<h3>${filenames[idx]}</h3>`
  section.appendChild(statusDiv)
  if (btn) {
    section.appendChild(dlBtn)
  }

  return section
}

function setMainStatus(type) {
  if (type === '') {
    mainStatusDiv.style.display = 'none'
    mainStatusDiv.style.display = 'none'
  } else {
    mainStatusDiv.style.display = 'block'
    if (type === TXT_PROCESSING) {
      mainStatusDiv.innerHTML = type
      mainStatusDiv.style.color = 'blue'
    } else if (type === TXT_DONE) {
      mainStatusDiv.innerHTML = type
      mainStatusDiv.style.color = 'blue'
    }
  }
}

function basename(path) {
  return path.split('/').pop()
}

function simplify_language(lang) {
  return lang.split('-').shift().toLowerCase()
}

class EPUBBook {
  fixedProblems = []

  // Add UTF-8 encoding declaration if missing
  fixEncoding() {
    const encoding = '<?xml version="1.0" encoding="utf-8"?>'
    const regex = /^<\?xml\s+version=["'][\d.]+["']\s+encoding=["'][a-zA-Z\d-.]+["'].*?\?>/i

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

filePicker.addEventListener('change', async (e) => {
  const selectedFile = e.target.files[0]
  setMainStatus(TXT_PROCESSING)
  outputDiv.innerHTML = ''
  btnDlAll.style.display = 'none'

  for (const file of e.target.files) {
    await processEPUB(file, file.name)
  }
  setMainStatus(TXT_DONE)

  if (e.target.files.length > 1) {
    btnDlAll.style.display = 'block'
  }
})

async function processEPUB (inputBlob, name) {
  try {
    // Load EPUB
    const epub = new EPUBBook()
    await epub.readEPUB(inputBlob)

    // Run fixing procedure
    epub.fixBodyIdLink()
    epub.fixBookLanguage()
    epub.fixStrayIMG()
    epub.fixEncoding()

    // Write EPUB
    const blob = await epub.writeEPUB()
    const idx = filenames.length
    filenames.push(name)
    fixedBlobs.push(blob)

    if (epub.fixedProblems.length > 0) {
      dlfilenames.push("(fixed) " + name)
      outputDiv.appendChild(build_output_html(idx, epub.fixedProblems))
    } else {
      dlfilenames.push("(repacked) " + name)
      outputDiv.appendChild(build_output_html(idx, TXT_NO_ERROR))
    }
  } catch (e) {
    console.error(e)
    const idx = filenames.length
    filenames.push(name)
    while (fixedBlobs.length !== filenames.length) {
      fixedBlobs.push(null)
    }
    while (dlfilenames.length !== filenames.length) {
      dlfilenames.push(null)
    }
    outputDiv.appendChild(build_output_html(idx, TXT_SYS_ERROR))
  }
}

async function downloadAll() {
  const old = mainStatusDiv.innerHTML
  mainStatusDiv.innerHTML = 'Preparing download...'
  const blobWriter = new zip.BlobWriter('application/zip')
  const writer = new zip.ZipWriter(blobWriter, { extendedTimestamp: false })
  for (let i = 0; i < fixedBlobs.length; i++) {
    if (fixedBlobs[i])
      await writer.add(dlfilenames[i], new zip.BlobReader(fixedBlobs[i]))
  }
  await writer.close()
  const blob = blobWriter.getData()
  saveAs(blob, 'fixed-epubs.zip')
  mainStatusDiv.innerHTML = old
}

btnDlAll.addEventListener('click', downloadAll)

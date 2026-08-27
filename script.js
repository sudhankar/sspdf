const { PDFDocument, rgb, StandardFonts } = PDFLib;


// PDF.js Worker

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


// Elements

const fileInput = document.getElementById("fileInput");

const uploadScreen =
  document.getElementById("uploadScreen");

const editorScreen =
  document.getElementById("editorScreen");

const dropZone =
  document.getElementById("dropZone");

const canvas =
  document.getElementById("pdfCanvas");

const ctx =
  canvas.getContext("2d");

const pageInfo =
  document.getElementById("pageInfo");

const textLayer =
  document.getElementById("textLayer");


// PDF Variables

let pdfBytes = null;

let pdfDoc = null;

let currentPage = 1;

let totalPages = 0;

let scale = 1.2;

let textElements = {};


// Open File

fileInput.addEventListener(
  "change",
  function(event) {

    const file =
      event.target.files[0];

    if (file) {

      loadPDF(file);

    }

  }
);


// Drag and Drop

dropZone.addEventListener(
  "dragover",
  function(event) {

    event.preventDefault();

    dropZone.classList.add("dragover");

  }
);


dropZone.addEventListener(
  "dragleave",
  function() {

    dropZone.classList.remove("dragover");

  }
);


dropZone.addEventListener(
  "drop",
  function(event) {

    event.preventDefault();

    dropZone.classList.remove("dragover");

    const file =
      event.dataTransfer.files[0];

    if (
      file &&
      file.type === "application/pdf"
    ) {

      loadPDF(file);

    }
    else {

      alert(
        "Please select a valid PDF file."
      );

    }

  }
);


// Load PDF

async function loadPDF(file) {

  pdfBytes =
    await file.arrayBuffer();


  pdfDoc =
    await pdfjsLib.getDocument(
      { data: pdfBytes.slice(0) }
    ).promise;


  totalPages =
    pdfDoc.numPages;


  currentPage = 1;


  uploadScreen.classList.add("hidden");

  editorScreen.classList.remove("hidden");


  renderPage();

}


// Render Page

async function renderPage() {

  const page =
    await pdfDoc.getPage(
      currentPage
    );


  const viewport =
    page.getViewport(
      { scale: scale }
    );


  canvas.width =
    viewport.width;

  canvas.height =
    viewport.height;


  textLayer.style.width =
    viewport.width + "px";

  textLayer.style.height =
    viewport.height + "px";


  await page.render({

    canvasContext: ctx,

    viewport: viewport

  }).promise;


  pageInfo.textContent =
    "Page " +
    currentPage +
    " / " +
    totalPages;


  showTexts();

}


// Previous Page

document.getElementById(
  "prevPage"
).addEventListener(
  "click",
  function() {

    if (currentPage > 1) {

      currentPage--;

      renderPage();

    }

  }
);


// Next Page

document.getElementById(
  "nextPage"
).addEventListener(
  "click",
  function() {

    if (
      currentPage <
      totalPages
    ) {

      currentPage++;

      renderPage();

    }

  }
);


// Zoom In

document.getElementById(
  "zoomIn"
).addEventListener(
  "click",
  function() {

    scale += 0.2;

    updateZoom();

    renderPage();

  }
);


// Zoom Out

document.getElementById(
  "zoomOut"
).addEventListener(
  "click",
  function() {

    if (scale > 0.4) {

      scale -= 0.2;

      updateZoom();

      renderPage();

    }

  }
);


function updateZoom() {

  document.getElementById(
    "zoomLevel"
  ).textContent =
    Math.round(scale * 100) + "%";

}


// Add Text

document.getElementById(
  "addText"
).addEventListener(
  "click",
  function() {

    createTextElement();

  }
);


function createTextElement(
  text = "Type here",
  x = 100,
  y = 100
) {

  const input =
    document.createElement(
      "input"
    );


  input.type = "text";


  input.value = text;


  input.className =
    "text-item";


  input.style.left =
    x + "px";


  input.style.top =
    y + "px";


  input.draggable = true;


  input.addEventListener(
    "dragstart",
    function(event) {

      event.dataTransfer.setData(
        "text/plain",
        ""
      );

    }
  );


  input.addEventListener(
    "dragend",
    function(event) {

      const rect =
        textLayer.getBoundingClientRect();


      let newX =
        event.clientX -
        rect.left;


      let newY =
        event.clientY -
        rect.top;


      input.style.left =
        newX + "px";


      input.style.top =
        newY + "px";

    }
  );


  textLayer.appendChild(
    input
  );


  if (!textElements[currentPage]) {

    textElements[currentPage] = [];

  }


  textElements[currentPage].push(
    input
  );


  input.focus();

  input.select();

}


// Show Texts for Current Page

function showTexts() {

  textLayer.innerHTML = "";


  if (
    textElements[currentPage]
  ) {

    textElements[
      currentPage
    ].forEach(
      function(input) {

        textLayer.appendChild(
          input
        );

      }
    );

  }

}


// Download Edited PDF

document.getElementById(
  "downloadPDF"
).addEventListener(
  "click",
  async function() {

    try {

      const pdf =
        await PDFDocument.load(
          pdfBytes
        );


      const pages =
        pdf.getPages();


      for (
        let pageNumber = 1;
        pageNumber <= totalPages;
        pageNumber++
      ) {

        const page =
          pages[
            pageNumber - 1
          ];


        const pageHeight =
          page.getHeight();


        if (
          textElements[
            pageNumber
          ]
        ) {

          textElements[
            pageNumber
          ].forEach(
            function(input) {

              const text =
                input.value;


              const x =
                parseFloat(
                  input.style.left
                ) / scale;


              const yFromTop =
                parseFloat(
                  input.style.top
                ) / scale;


              const y =
                pageHeight -
                yFromTop -
                20;


              page.drawText(
                text,
                {

                  x: x,

                  y: y,

                  size: 16,

                  color: rgb(
                    0,
                    0,
                    0
                  )

                }
              );

            }
          );

        }

      }


      const newPdfBytes =
        await pdf.save();


      const blob =
        new Blob(
          [newPdfBytes],
          {
            type:
              "application/pdf"
          }
        );


      const url =
        URL.createObjectURL(
          blob
        );


      const link =
        document.createElement(
          "a"
        );


      link.href = url;


      link.download =
        "edited-document.pdf";


      link.click();


      URL.revokeObjectURL(
        url
      );


    }
    catch (error) {

      console.error(error);

      alert(
        "PDF could not be saved."
      );

    }

  }
);

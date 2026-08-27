/* ==========================================
   SSPDF EDITOR
   Client-side PDF editor
========================================== */


const {
  PDFDocument,
  rgb,
  StandardFonts
} = PDFLib;


/* PDF.js worker */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


/* ==========================================
   ELEMENTS
========================================== */

const fileInput =
  document.getElementById("fileInput");

const dropZone =
  document.getElementById("dropZone");

const homeScreen =
  document.getElementById("homeScreen");

const editorScreen =
  document.getElementById("editorScreen");

const pdfCanvas =
  document.getElementById("pdfCanvas");

const pdfWrapper =
  document.getElementById("pdfWrapper");

const textLayer =
  document.getElementById("textLayer");

const ctx =
  pdfCanvas.getContext("2d");


/* ==========================================
   STATE
========================================== */

let originalPDFBytes = null;

let pdfViewer = null;

let currentPage = 1;

let totalPages = 0;

let scale = 1.25;

let selectedText = null;


/*
   Text objects are stored separately
   for each PDF page.
*/

let textObjects = {};


/*
   Undo history
*/

let undoHistory = [];


/* ==========================================
   OPEN PDF
========================================== */

fileInput.addEventListener(
  "change",
  function(event) {

    const file =
      event.target.files[0];

    if (!file) {
      return;
    }

    openPDF(file);

  }
);


/* ==========================================
   DRAG & DROP
========================================== */

dropZone.addEventListener(
  "dragover",
  function(event) {

    event.preventDefault();

    dropZone.classList.add(
      "dragover"
    );

  }
);


dropZone.addEventListener(
  "dragleave",
  function() {

    dropZone.classList.remove(
      "dragover"
    );

  }
);


dropZone.addEventListener(
  "drop",
  function(event) {

    event.preventDefault();

    dropZone.classList.remove(
      "dragover"
    );


    const file =
      event.dataTransfer.files[0];


    if (
      file &&
      file.type === "application/pdf"
    ) {

      openPDF(file);

    }
    else {

      alert(
        "Please select a PDF file."
      );

    }

  }
);


/* ==========================================
   OPEN PDF FUNCTION
========================================== */

async function openPDF(file) {

  try {

    originalPDFBytes =
      await file.arrayBuffer();


    /*
      PDF.js gets a COPY of the bytes.
      The original data remains available
      for pdf-lib when downloading.
    */

    pdfViewer =
      await pdfjsLib.getDocument({

        data:
          originalPDFBytes.slice(0)

      }).promise;


    totalPages =
      pdfViewer.numPages;


    currentPage = 1;


    textObjects = {};

    undoHistory = [];

    selectedText = null;


    homeScreen.classList.add(
      "hidden"
    );

    editorScreen.classList.remove(
      "hidden"
    );


    await renderPage();


  }
  catch (error) {

    console.error(error);

    alert(
      "Unable to open this PDF."
    );

  }

}


/* ==========================================
   RENDER PAGE
========================================== */

async function renderPage() {

  if (!pdfViewer) {
    return;
  }


  const page =
    await pdfViewer.getPage(
      currentPage
    );


  const viewport =
    page.getViewport({

      scale: scale

    });


  pdfCanvas.width =
    viewport.width;

  pdfCanvas.height =
    viewport.height;


  pdfWrapper.style.width =
    viewport.width + "px";

  pdfWrapper.style.height =
    viewport.height + "px";


  textLayer.style.width =
    viewport.width + "px";

  textLayer.style.height =
    viewport.height + "px";


  await page.render({

    canvasContext:
      ctx,

    viewport:
      viewport

  }).promise;


  updatePageInfo();


  renderTextObjects();

}


/* ==========================================
   PAGE INFO
========================================== */

function updatePageInfo() {

  document.getElementById(
    "pageInfo"
  ).textContent =
    currentPage +
    " / " +
    totalPages;

}


/* ==========================================
   NEXT PAGE
========================================== */

document.getElementById(
  "nextPage"
).addEventListener(
  "click",
  async function() {

    if (
      currentPage <
      totalPages
    ) {

      currentPage++;

      selectedText = null;

      await renderPage();

    }

  }
);


/* ==========================================
   PREVIOUS PAGE
========================================== */

document.getElementById(
  "prevPage"
).addEventListener(
  "click",
  async function() {

    if (currentPage > 1) {

      currentPage--;

      selectedText = null;

      await renderPage();

    }

  }
);


/* ==========================================
   ZOOM IN
========================================== */

document.getElementById(
  "zoomIn"
).addEventListener(
  "click",
  async function() {

    scale += 0.15;

    updateZoom();

    await renderPage();

  }
);


/* ==========================================
   ZOOM OUT
========================================== */

document.getElementById(
  "zoomOut"
).addEventListener(
  "click",
  async function() {

    if (scale <= 0.4) {
      return;
    }

    scale -= 0.15;

    updateZoom();

    await renderPage();

  }
);


/* ==========================================
   UPDATE ZOOM
========================================== */

function updateZoom() {

  document.getElementById(
    "zoomLevel"
  ).textContent =
    Math.round(
      scale * 100
    ) + "%";

}


/* ==========================================
   ADD TEXT
========================================== */

document.getElementById(
  "addText"
).addEventListener(
  "click",
  function() {

    addText();

  }
);


/* ==========================================
   ADD TEXT FUNCTION
========================================== */

function addText() {

  if (!textObjects[currentPage]) {

    textObjects[currentPage] = [];

  }


  saveUndo();


  const textObject = {

    id:
      Date.now(),

    text:
      "Type here",

    x:
      80,

    y:
      80,

    fontSize:
      18

  };


  textObjects[
    currentPage
  ].push(
    textObject
  );


  renderTextObjects();


  /*
    Automatically select the new text.
  */

  const inputs =
    textLayer.querySelectorAll(
      ".pdf-text"
    );


  const last =
    inputs[
      inputs.length - 1
    ];


  if (last) {

    last.focus();

    last.select();

  }

}


/* ==========================================
   RENDER TEXT OBJECTS
========================================== */

function renderTextObjects() {

  textLayer.innerHTML = "";

  selectedText = null;


  const objects =
    textObjects[currentPage] || [];


  objects.forEach(
    function(obj) {

      const input =
        document.createElement(
          "input"
        );


      input.type =
        "text";


      input.className =
        "pdf-text";


      input.value =
        obj.text;


      input.dataset.id =
        obj.id;


      /*
        Screen coordinates.
      */

      input.style.left =
        (obj.x * scale) + "px";


      input.style.top =
        (obj.y * scale) + "px";


      input.style.fontSize =
        (obj.fontSize * scale) + "px";


      input.style.width =
        Math.max(
          100,
          obj.text.length * 10
        ) + "px";


      /* Text changed */

      input.addEventListener(
        "input",
        function() {

          obj.text =
            input.value;

        }
      );


      /* Selection */

      input.addEventListener(
        "focus",
        function() {

          selectedText =
            obj;

          input.classList.add(
            "selected"
          );

        }
      );


      input.addEventListener(
        "blur",
        function() {

          input.classList.remove(
            "selected"
          );

        }
      );


      /*
        Drag support
      */

      makeDraggable(
        input,
        obj
      );


      textLayer.appendChild(
        input
      );

    }
  );

}


/* ==========================================
   DRAG TEXT
========================================== */

function makeDraggable(
  element,
  object
) {

  let dragging = false;

  let offsetX = 0;

  let offsetY = 0;


  element.addEventListener(
    "mousedown",
    function(event) {

      /*
        Don't start dragging when
        user is selecting/editing text.
      */

      if (
        event.detail > 1
      ) {
        return;
      }


      dragging = true;


      const rect =
        element.getBoundingClientRect();


      offsetX =
        event.clientX -
        rect.left;


      offsetY =
        event.clientY -
        rect.top;


      event.preventDefault();

    }
  );


  document.addEventListener(
    "mousemove",
    function(event) {

      if (!dragging) {
        return;
      }


      const layerRect =
        textLayer.getBoundingClientRect();


      const newX =
        event.clientX -
        layerRect.left -
        offsetX;


      const newY =
        event.clientY -
        layerRect.top -
        offsetY;


      object.x =
        Math.max(
          0,
          newX / scale
        );


      object.y =
        Math.max(
          0,
          newY / scale
        );


      element.style.left =
        object.x * scale +
        "px";


      element.style.top =
        object.y * scale +
        "px";

    }
  );


  document.addEventListener(
    "mouseup",
    function() {

      dragging = false;

    }
  );

}


/* ==========================================
   DELETE SELECTED TEXT
========================================== */

document.getElementById(
  "deleteSelected"
).addEventListener(
  "click",
  function() {

    if (!selectedText) {

      alert(
        "First select a text box."
      );

      return;

    }


    saveUndo();


    const objects =
      textObjects[currentPage];


    if (!objects) {
      return;
    }


    textObjects[currentPage] =
      objects.filter(
        function(obj) {

          return (
            obj.id !==
            selectedText.id
          );

        }
      );


    selectedText = null;


    renderTextObjects();

  }
);


/* ==========================================
   UNDO
========================================== */

function saveUndo() {

  const snapshot =
    JSON.stringify(
      textObjects
    );


  undoHistory.push(
    snapshot
  );


  /*
    Keep history manageable.
  */

  if (
    undoHistory.length > 30
  ) {

    undoHistory.shift();

  }

}


/* ==========================================
   UNDO BUTTON
========================================== */

document.getElementById(
  "undoButton"
).addEventListener(
  "click",
  function() {

    if (
      undoHistory.length === 0
    ) {

      return;

    }


    const previous =
      undoHistory.pop();


    textObjects =
      JSON.parse(
        previous
      );


    renderTextObjects();

  }
);


/* ==========================================
   OPEN ANOTHER PDF
========================================== */

document.getElementById(
  "openAnother"
).addEventListener(
  "click",
  function() {

    fileInput.value = "";

    fileInput.click();

  }
);


/* ==========================================
   DOWNLOAD PDF
========================================== */

document.getElementById(
  "downloadPDF"
).addEventListener(
  "click",
  async function() {

    if (!originalPDFBytes) {

      return;

    }


    try {

      const pdf =
        await PDFDocument.load(
          originalPDFBytes
        );


      const font =
        await pdf.embedFont(
          StandardFonts.Helvetica
        );


      const pages =
        pdf.getPages();


      /*
        Add text to every page.
      */

      for (
        let pageNumber = 1;
        pageNumber <= totalPages;
        pageNumber++
      ) {

        const objects =
          textObjects[
            pageNumber
          ] || [];


        if (
          objects.length === 0
        ) {

          continue;

        }


        const page =
          pages[
            pageNumber - 1
          ];


        const pageHeight =
          page.getHeight();


        objects.forEach(
          function(obj) {

            if (
              !obj.text ||
              obj.text.trim() === ""
            ) {

              return;

            }


            /*
              Convert screen coordinates
              back to PDF coordinates.
            */

            const pdfX =
              obj.x;


            const pdfY =
              pageHeight -
              obj.y -
              obj.fontSize;


            page.drawText(
              obj.text,
              {

                x:
                  pdfX,

                y:
                  pdfY,

                size:
                  obj.fontSize,

                font:
                  font,

                color:
                  rgb(
                    0,
                    0,
                    0
                  )

              }
            );

          }
        );

      }


      /*
        Save PDF.
      */

      const newBytes =
        await pdf.save();


      const blob =
        new Blob(
          [newBytes],
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


      link.href =
        url;


      link.download =
        "SSPDF-edited.pdf";


      document.body.appendChild(
        link
      );


      link.click();


      link.remove();


      setTimeout(
        function() {

          URL.revokeObjectURL(
            url
          );

        },
        1000
      );


    }
    catch (error) {

      console.error(error);

      alert(
        "Could not create the edited PDF."
      );

    }

  }
);

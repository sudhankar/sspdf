/* ==========================================
   SSPDF - CLIENT SIDE PDF EDITOR
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
   HTML ELEMENTS
========================================== */

const fileInput =
  document.getElementById("fileInput");

const dropZone =
  document.getElementById("dropZone");

const uploadScreen =
  document.getElementById("uploadScreen");

const editorScreen =
  document.getElementById("editorScreen");

const pdfCanvas =
  document.getElementById("pdfCanvas");

const pdfPage =
  document.getElementById("pdfPage");

const textLayer =
  document.getElementById("textLayer");

const ctx =
  pdfCanvas.getContext("2d");


/* ==========================================
   PDF STATE
========================================== */

let originalPDFBytes = null;

let pdfViewer = null;

let currentPage = 1;

let totalPages = 0;

let scale = 1.25;


/*
  Text objects for every page.

  Example:

  textObjects[1] = [...]
  textObjects[2] = [...]
*/

let textObjects = {};


/* Currently selected text */

let selectedText = null;


/* Undo history */

let undoHistory = [];


/* ==========================================
   FILE INPUT
========================================== */

fileInput.addEventListener(
  "change",
  function (event) {

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
  function (event) {

    event.preventDefault();

    dropZone.classList.add(
      "dragover"
    );

  }
);


dropZone.addEventListener(
  "dragleave",
  function () {

    dropZone.classList.remove(
      "dragover"
    );

  }
);


dropZone.addEventListener(
  "drop",
  function (event) {

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

    } else {

      alert(
        "Please select a valid PDF file."
      );

    }

  }
);


/* ==========================================
   OPEN PDF
========================================== */

async function openPDF(file) {

  try {

    /*
      Read PDF into browser memory.
    */

    originalPDFBytes =
      await file.arrayBuffer();


    /*
      PDF.js gets a copy.

      The PDF is NOT uploaded
      to our server.
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

    selectedText = null;

    undoHistory = [];


    /*
      Switch from upload screen
      to editor.
    */

    uploadScreen.classList.add(
      "hidden"
    );

    editorScreen.classList.remove(
      "hidden"
    );


    await renderPage();


  } catch (error) {

    console.error(error);

    alert(
      "Unable to open this PDF."
    );

  }

}


/* ==========================================
   RENDER PDF PAGE
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

      scale:
        scale

    });


  /*
    Set canvas size.
  */

  pdfCanvas.width =
    viewport.width;

  pdfCanvas.height =
    viewport.height;


  /*
    Set wrapper size.
  */

  pdfPage.style.width =
    viewport.width + "px";

  pdfPage.style.height =
    viewport.height + "px";


  /*
    Text layer size.
  */

  textLayer.style.width =
    viewport.width + "px";

  textLayer.style.height =
    viewport.height + "px";


  /*
    Render PDF.
  */

  await page.render({

    canvasContext:
      ctx,

    viewport:
      viewport

  }).promise;


  updatePageInfo();

  updateZoomText();

  renderTextObjects();

}


/* ==========================================
   PAGE INFORMATION
========================================== */

function updatePageInfo() {

  document.getElementById(
    "pageNumber"
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
  async function () {

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
  "previousPage"
).addEventListener(
  "click",
  async function () {

    if (
      currentPage > 1
    ) {

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
  "zoomPlus"
).addEventListener(
  "click",
  async function () {

    scale += 0.15;

    await renderPage();

  }
);


/* ==========================================
   ZOOM OUT
========================================== */

document.getElementById(
  "zoomMinus"
).addEventListener(
  "click",
  async function () {

    if (
      scale <= 0.4
    ) {

      return;

    }


    scale -= 0.15;

    await renderPage();

  }
);


/* ==========================================
   ZOOM DISPLAY
========================================== */

function updateZoomText() {

  document.getElementById(
    "zoomValue"
  ).textContent =
    Math.round(
      scale * 100
    ) +
    "%";

}


/* ==========================================
   ADD TEXT BUTTON
========================================== */

document.getElementById(
  "textTool"
).addEventListener(
  "click",
  function () {

    addTextObject();

  }
);


/* ==========================================
   ADD TEXT OBJECT
========================================== */

function addTextObject() {

  if (
    !textObjects[currentPage]
  ) {

    textObjects[currentPage] =
      [];

  }


  /*
    Save state before editing.
  */

  saveUndo();


  const object = {

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
    object
  );


  renderTextObjects();


  /*
    Select newly created text.
  */

  const inputs =
    textLayer.querySelectorAll(
      ".pdf-text"
    );


  const lastInput =
    inputs[
      inputs.length - 1
    ];


  if (lastInput) {

    lastInput.focus();

    lastInput.select();

  }

}


/* ==========================================
   RENDER TEXT
========================================== */

function renderTextObjects() {

  textLayer.innerHTML = "";

  selectedText = null;


  const objects =
    textObjects[
      currentPage
    ] || [];


  objects.forEach(
    function (object) {

      const input =
        document.createElement(
          "input"
        );


      input.type =
        "text";


      input.className =
        "pdf-text";


      input.value =
        object.text;


      input.dataset.id =
        object.id;


      /*
        Convert PDF coordinates
        to screen coordinates.
      */

      input.style.left =
        (
          object.x *
          scale
        ) +
        "px";


      input.style.top =
        (
          object.y *
          scale
        ) +
        "px";


      input.style.fontSize =
        (
          object.fontSize *
          scale
        ) +
        "px";


      /*
        Text width.
      */

      input.style.width =
        Math.max(
          100,
          object.text.length * 10
        ) +
        "px";


      /* -------------------------
         TEXT CHANGE
      ------------------------- */

      input.addEventListener(
        "input",
        function () {

          object.text =
            input.value;

        }
      );


      /* -------------------------
         SELECT
      ------------------------- */

      input.addEventListener(
        "focus",
        function () {

          selectedText =
            object;

          input.classList.add(
            "selected"
          );

        }
      );


      input.addEventListener(
        "click",
        function () {

          selectedText =
            object;

          input.classList.add(
            "selected"
          );

        }
      );


      /* -------------------------
         DRAG
      ------------------------- */

      makeDraggable(
        input,
        object
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

  let startX = 0;

  let startY = 0;


  element.addEventListener(
    "mousedown",
    function (event) {

      /*
        Ignore right mouse button.
      */

      if (
        event.button !== 0
      ) {

        return;

      }


      /*
        If clicking inside the
        text input, allow editing.
      */

      if (
        document.activeElement ===
        element
      ) {

        return;

      }


      dragging = true;


      const rect =
        element.getBoundingClientRect();


      startX =
        event.clientX -
        rect.left;


      startY =
        event.clientY -
        rect.top;


      selectedText =
        object;


      event.preventDefault();

    }
  );


  document.addEventListener(
    "mousemove",
    function (event) {

      if (!dragging) {
        return;
      }


      const layerRect =
        textLayer.getBoundingClientRect();


      const screenX =
        event.clientX -
        layerRect.left -
        startX;


      const screenY =
        event.clientY -
        layerRect.top -
        startY;


      object.x =
        Math.max(
          0,
          screenX / scale
        );


      object.y =
        Math.max(
          0,
          screenY / scale
        );


      element.style.left =
        (
          object.x *
          scale
        ) +
        "px";


      element.style.top =
        (
          object.y *
          scale
        ) +
        "px";

    }
  );


  document.addEventListener(
    "mouseup",
    function () {

      dragging = false;

    }
  );

}


/* ==========================================
   DELETE TEXT
========================================== */

document.getElementById(
  "deleteTool"
).addEventListener(
  "click",
  function () {

    if (!selectedText) {

      alert(
        "First select a text box."
      );

      return;

    }


    saveUndo();


    const objects =
      textObjects[
        currentPage
      ] || [];


    textObjects[
      currentPage
    ] =
      objects.filter(
        function (object) {

          return (
            object.id !==
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

  undoHistory.push(
    JSON.stringify(
      textObjects
    )
  );


  /*
    Keep maximum 30 states.
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
  "undoTool"
).addEventListener(
  "click",
  function () {

    if (
      undoHistory.length === 0
    ) {

      return;

    }


    const previousState =
      undoHistory.pop();


    textObjects =
      JSON.parse(
        previousState
      );


    selectedText = null;


    renderTextObjects();

  }
);


/* ==========================================
   OPEN ANOTHER PDF
========================================== */

document.getElementById(
  "openButton"
).addEventListener(
  "click",
  function () {

    fileInput.value = "";

    fileInput.click();

  }
);


/* ==========================================
   DOWNLOAD PDF
========================================== */

document.getElementById(
  "downloadButton"
).addEventListener(
  "click",
  async function () {

    if (!originalPDFBytes) {

      alert(
        "No PDF is open."
      );

      return;

    }


    try {

      /*
        Load original PDF
        completely in browser.
      */

      const pdf =
        await PDFDocument.load(
          originalPDFBytes
        );


      /*
        Embed standard Helvetica font.
      */

      const font =
        await pdf.embedFont(
          StandardFonts.Helvetica
        );


      const pages =
        pdf.getPages();


      /*
        Process every page.
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
          function (object) {

            const text =
              object.text;


            if (
              !text ||
              !text.trim()
            ) {

              return;

            }


            /*
              Convert coordinates.

              Browser:
              top -> down

              PDF:
              bottom -> up
            */

            const x =
              object.x;


            const y =
              pageHeight -
              object.y -
              object.fontSize;


            page.drawText(
              text,
              {

                x:
                  x,

                y:
                  y,

                size:
                  object.fontSize,

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
        Create new PDF.
      */

      const newPDF =
        await pdf.save();


      /*
        Create browser download.
      */

      const blob =
        new Blob(
          [newPDF],
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
        function () {

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

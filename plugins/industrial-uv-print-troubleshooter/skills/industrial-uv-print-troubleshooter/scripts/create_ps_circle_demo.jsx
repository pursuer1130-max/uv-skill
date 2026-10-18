#target photoshop

app.displayDialogs = DialogModes.NO;

var outputFolder = Folder(typeof UV_DEMO_OUTPUT !== 'undefined' ? UV_DEMO_OUTPUT : Folder.desktop.fsName + '/UV-circle-' + new Date().getTime());
if (!outputFolder.exists) {
    outputFolder.create();
}

var docName = "uv-circle-demo";
var widthMm = 100;
var heightMm = 100;
var resolution = 300;

var doc = app.documents.add(
    UnitValue(widthMm, "mm"),
    UnitValue(heightMm, "mm"),
    resolution,
    docName,
    NewDocumentMode.CMYK,
    DocumentFill.WHITE
);

var circleLayer = doc.artLayers.add();
circleLayer.name = "CMYK circle demo - safe test artwork";

var black = new SolidColor();
black.cmyk.cyan = 0;
black.cmyk.magenta = 0;
black.cmyk.yellow = 0;
black.cmyk.black = 100;

var centerX = doc.width.as("px") / 2;
var centerY = doc.height.as("px") / 2;
var radius = Math.min(doc.width.as("px"), doc.height.as("px")) * 0.28;
var points = [];
var steps = 96;
for (var i = 0; i < steps; i++) {
    var angle = (Math.PI * 2 * i) / steps;
    points.push([
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius
    ]);
}

doc.selection.select(points);
doc.selection.fill(black, ColorBlendMode.NORMAL, 100, false);
doc.selection.deselect();

var textLayer = doc.artLayers.add();
textLayer.kind = LayerKind.TEXT;
textLayer.name = "demo label";
textLayer.textItem.contents = "UV demo circle";
textLayer.textItem.size = 24;
textLayer.textItem.position = [UnitValue(22, "mm"), UnitValue(88, "mm")];

var psdFile = File(outputFolder.fsName + "/uv-circle-demo.psd");
var psdOptions = new PhotoshopSaveOptions();
psdOptions.layers = true;
doc.saveAs(psdFile, psdOptions, true, Extension.LOWERCASE);

var tifFile = File(outputFolder.fsName + "/uv-circle-demo.tif");
var tifOptions = new TiffSaveOptions();
tifOptions.imageCompression = TIFFEncoding.NONE;
tifOptions.layers = false;
doc.saveAs(tifFile, tifOptions, true, Extension.LOWERCASE);

var pngFile = File(outputFolder.fsName + "/uv-circle-demo.png");
var pngOptions = new PNGSaveOptions();
var pngDoc = doc.duplicate(docName + "-png-preview", false);
pngDoc.changeMode(ChangeMode.RGB);
pngDoc.saveAs(pngFile, pngOptions, true, Extension.LOWERCASE);
pngDoc.close(SaveOptions.DONOTSAVECHANGES);

doc.close(SaveOptions.DONOTSAVECHANGES);

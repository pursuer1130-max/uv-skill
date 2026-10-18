#target photoshop
app.displayDialogs = DialogModes.NO;

(function () {
    var desktop = Folder.desktop.fsName;
    var outDir = new Folder(desktop + "/PS浮雕测试");
    if (!outDir.exists) outDir.create();

    var oldUnits = app.preferences.rulerUnits;
    var oldType = app.preferences.typeUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.POINTS;

    var doc = app.documents.add(1417, 1417, 300, "UV_Emboss_Circle_Demo", NewDocumentMode.RGB, DocumentFill.WHITE);

    function rgb(hex) {
        var c = new SolidColor();
        c.rgb.red = parseInt(hex.substr(0, 2), 16);
        c.rgb.green = parseInt(hex.substr(2, 2), 16);
        c.rgb.blue = parseInt(hex.substr(4, 2), 16);
        return c;
    }

    function ellipseLayer(name, bounds, colorHex) {
        var layer = doc.artLayers.add();
        layer.name = name;
        doc.selection.select([
            [bounds[0], bounds[1]], [bounds[2], bounds[1]],
            [bounds[2], bounds[3]], [bounds[0], bounds[3]]
        ], SelectionType.REPLACE, 0, true);
        doc.selection.fill(rgb(colorHex), ColorBlendMode.NORMAL, 100, false);
        doc.selection.deselect();
        return layer;
    }

    function textLayer(name, text, size, y, colorHex) {
        var layer = doc.artLayers.add();
        layer.kind = LayerKind.TEXT;
        layer.name = name;
        layer.textItem.contents = text;
        layer.textItem.size = size;
        layer.textItem.font = "MicrosoftYaHei-Bold";
        layer.textItem.color = rgb(colorHex);
        layer.textItem.justification = Justification.CENTER;
        layer.textItem.position = [708, y];
        return layer;
    }

    var bg = doc.artLayers.add();
    bg.name = "warm ivory background";
    doc.selection.select([[0,0],[1417,0],[1417,1417],[0,1417]]);
    doc.selection.fill(rgb("F6F1E8"));
    doc.selection.deselect();

    ellipseLayer("soft outer shadow", [205, 225, 1210, 1230], "B8A56A").opacity = 28;
    var base = ellipseLayer("emboss base circle", [185, 185, 1232, 1232], "D9C071");
    var highlight = ellipseLayer("upper-left raised highlight", [230, 225, 1162, 1157], "FFF4BF");
    highlight.opacity = 52;
    var inner = ellipseLayer("recessed inner medallion", [330, 330, 1087, 1087], "B98A38");
    inner.opacity = 62;
    ellipseLayer("inner light bevel", [365, 350, 1060, 1045], "F4DA86").opacity = 46;

    for (var i = 0; i < 36; i++) {
        var a = i * 10 * Math.PI / 180;
        var cx = 708 + Math.cos(a) * 455;
        var cy = 708 + Math.sin(a) * 455;
        ellipseLayer("raised bead " + (i + 1), [cx - 18, cy - 18, cx + 18, cy + 18], i % 2 ? "EAD184" : "9E742D");
    }

    textLayer("main editable title", "浮雕圆章", 118, 680, "42280F");
    textLayer("editable subtitle", "UV EMBOSS SAMPLE", 42, 790, "5A3715");

    var gloss = ellipseLayer("varnish gloss mask preview", [455, 440, 965, 620], "FFFFFF");
    gloss.opacity = 34;

    var psd = new File(outDir.fsName + "/浮雕圆章测试.psd");
    var psdOpt = new PhotoshopSaveOptions();
    psdOpt.layers = true;
    doc.saveAs(psd, psdOpt, true, Extension.LOWERCASE);

    var png = new File(outDir.fsName + "/浮雕圆章预览.png");
    var pngOpt = new PNGSaveOptions();
    doc.saveAs(png, pngOpt, true, Extension.LOWERCASE);

    var flat = doc.duplicate("UV_Emboss_Circle_Demo_flat", false);
    flat.flatten();
    var tif = new File(outDir.fsName + "/浮雕圆章打印RGB.tif");
    var tifOpt = new TiffSaveOptions();
    tifOpt.imageCompression = TIFFEncoding.NONE;
    tifOpt.embedColorProfile = true;
    flat.saveAs(tif, tifOpt, true, Extension.LOWERCASE);
    flat.close(SaveOptions.DONOTSAVECHANGES);

    doc.close(SaveOptions.DONOTSAVECHANGES);
    app.preferences.rulerUnits = oldUnits;
    app.preferences.typeUnits = oldType;
})();

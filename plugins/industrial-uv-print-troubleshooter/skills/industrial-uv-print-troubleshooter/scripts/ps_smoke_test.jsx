#target photoshop
(function () {
    var previousDialogs = app.displayDialogs;
    var previousUnits = app.preferences.rulerUnits;
    var previousDocument = app.documents.length ? app.activeDocument : null;
    var doc = null, flat = null, reopened = null, success = false;
    var stamp = new Date().getTime();
    var out = new Folder(Folder.desktop.fsName + '/PS_Ready_Test_' + stamp);
    if (!out.create()) throw new Error('Cannot create output directory: ' + out.fsName);
    function color(hex) {
        var c = new SolidColor();
        c.rgb.hexValue = hex;
        return c;
    }
    function circle(name, x, y, radius, hex) {
        var layer = doc.artLayers.add();
        layer.name = name;
        var d = new ActionDescriptor(), ref = new ActionReference(), bounds = new ActionDescriptor();
        ref.putProperty(charIDToTypeID('Chnl'), charIDToTypeID('fsel'));
        d.putReference(charIDToTypeID('null'), ref);
        bounds.putUnitDouble(charIDToTypeID('Top '), charIDToTypeID('#Pxl'), y - radius);
        bounds.putUnitDouble(charIDToTypeID('Left'), charIDToTypeID('#Pxl'), x - radius);
        bounds.putUnitDouble(charIDToTypeID('Btom'), charIDToTypeID('#Pxl'), y + radius);
        bounds.putUnitDouble(charIDToTypeID('Rght'), charIDToTypeID('#Pxl'), x + radius);
        d.putObject(charIDToTypeID('T   '), charIDToTypeID('Elps'), bounds);
        d.putBoolean(charIDToTypeID('AntA'), true);
        executeAction(charIDToTypeID('setd'), d, DialogModes.NO);
        doc.selection.fill(color(hex));
        doc.selection.deselect();
        return layer;
    }
    try {
        app.displayDialogs = DialogModes.NO;
        app.preferences.rulerUnits = Units.PIXELS;
        doc = app.documents.add(1200, 1200, 600, 'PS Ready Test - 600 ppi', NewDocumentMode.RGB, DocumentFill.WHITE);
        doc.selection.selectAll();
        doc.selection.fill(color('F5F5F7'));
        doc.selection.deselect();
        circle('Soft shadow', 614, 588, 342, 'D7DADD');
        circle('Teal circle', 600, 568, 338, '156C70');
        circle('Inset circle', 600, 568, 302, 'E6AE54');
        circle('Center circle', 600, 568, 281, '17494D');
        var text = doc.artLayers.add();
        text.kind = LayerKind.TEXT;
        text.name = 'Editable title';
        text.textItem.contents = 'PS';
        text.textItem.font = 'Arial-BoldMT';
        text.textItem.size = UnitValue(24, 'pt');
        text.textItem.justification = Justification.CENTER;
        text.textItem.position = [600, 638];
        text.textItem.color = color('FFFFFF');
        var caption = doc.artLayers.add();
        caption.kind = LayerKind.TEXT;
        caption.name = 'Editable caption';
        caption.textItem.contents = 'PHOTOSHOP  /  600 PPI';
        caption.textItem.font = 'ArialMT';
        caption.textItem.size = UnitValue(5, 'pt');
        caption.textItem.justification = Justification.CENTER;
        caption.textItem.position = [600, 1005];
        caption.textItem.color = color('303638');
        var psdFile = new File(out.fsName + '/PS_Test.psd');
        var psdOptions = new PhotoshopSaveOptions();
        psdOptions.layers = true;
        psdOptions.embedColorProfile = true;
        doc.saveAs(psdFile, psdOptions, false, Extension.LOWERCASE);
        flat = doc.duplicate('PS_Test_export', false);
        flat.flatten();
        var tifOptions = new TiffSaveOptions();
        tifOptions.imageCompression = TIFFEncoding.TIFFLZW;
        tifOptions.embedColorProfile = true;
        flat.saveAs(new File(out.fsName + '/PS_Test_RGB.tif'), tifOptions, true, Extension.LOWERCASE);
        flat.saveAs(new File(out.fsName + '/PS_Test.png'), new PNGSaveOptions(), true, Extension.LOWERCASE);
        flat.close(SaveOptions.DONOTSAVECHANGES);
        flat = null;
        doc.close(SaveOptions.DONOTSAVECHANGES);
        doc = null;
        reopened = app.open(psdFile);
        if (reopened.width.as('px') !== 1200 || reopened.height.as('px') !== 1200 || reopened.resolution !== 600 || reopened.artLayers.length < 7) {
            throw new Error('PSD reopen validation failed');
        }
        var marker = new File(out.fsName + '/COMPLETE.txt');
        marker.encoding = 'UTF8';
        if (!marker.open('w')) throw new Error('Cannot write completion marker');
        marker.write('Photoshop=' + app.version + '\nSize=1200x1200\nPPI=600\nLayers=' + reopened.artLayers.length + '\nPSD_REOPEN_OK\n');
        marker.close();
        success = true;
        app.bringToFront();
        return out.fsName;
    } finally {
        if (flat) { try { flat.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} }
        if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} }
        if (!success && reopened) { try { reopened.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} }
        app.preferences.rulerUnits = previousUnits;
        app.displayDialogs = previousDialogs;
        if (previousDocument) { try { app.activeDocument = previousDocument; } catch (_) {} }
    }
}());

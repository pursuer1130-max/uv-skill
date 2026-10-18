#target photoshop
// Set UV_BATCH_CONFIG in a small JSX launcher before evaluating this file.
(function () {
    if (typeof UV_BATCH_CONFIG === 'undefined') throw new Error('UV_BATCH_CONFIG is required');
    var cfg = UV_BATCH_CONFIG;
    var output = new Folder(cfg.output);
    if (!output.exists && !output.create()) throw new Error('Cannot create output folder');
    var oldDialogs = app.displayDialogs;
    var oldUnits = app.preferences.rulerUnits;
    var oldTypeUnits = app.preferences.typeUnits;
    var initialDoc = app.documents.length ? app.activeDocument : null;
    var owned = [];
    app.displayDialogs = DialogModes.NO;
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.POINTS;
    function mm(value) { return UnitValue(value, 'mm'); }
    function px(value) { return UnitValue(value, 'px'); }
    function color(hex) { var c = new SolidColor(); c.rgb.hexValue = hex; return c; }
    function track(doc) { owned.push(doc); return doc; }
    function close(doc) {
        for (var i = owned.length - 1; i >= 0; i--) if (owned[i] === doc) owned.splice(i, 1);
        doc.close(SaveOptions.DONOTSAVECHANGES);
    }
    function write(path, text) {
        var f = new File(path); f.encoding = 'UTF8';
        if (!f.open('w')) throw new Error('Cannot write: ' + path);
        f.write(text); f.close();
    }
    function append(text) {
        var f = new File(output.fsName + '/batch-log.tsv'); f.encoding = 'UTF8';
        if (!f.open('a')) throw new Error('Cannot append batch log');
        f.writeln(text); f.close();
    }
    function addText(doc, spec, defaultColor) {
        var layer = doc.artLayers.add(); layer.kind = LayerKind.TEXT;
        layer.name = 'TYPE - ' + spec.text;
        var text = layer.textItem;
        text.contents = spec.text;
        text.font = spec.font || 'SimSun';
        text.size = spec.size || 24;
        text.color = color(spec.color || defaultColor);
        text.justification = Justification.CENTER;
        text.antiAliasMethod = AntiAlias.SHARP;
        text.position = [px(doc.width.as('px') * (spec.x || .5)), px(doc.height.as('px') * spec.y)];
        var bounds = layer.bounds;
        var maxWidth = doc.width.as('px') * (spec.maxWidth || .78);
        if (bounds[2].as('px') - bounds[0].as('px') > maxWidth) {
            text.size = Number(text.size) * maxWidth / (bounds[2].as('px') - bounds[0].as('px'));
        }
        bounds = layer.bounds;
        if (bounds[0].as('px') < 0 || bounds[1].as('px') < 0 || bounds[2].as('px') > doc.width.as('px') || bounds[3].as('px') > doc.height.as('px')) {
            throw new Error('Text exceeds canvas: ' + spec.text);
        }
        return layer;
    }
    function saveTiff(doc, path) {
        var options = new TiffSaveOptions();
        options.imageCompression = TIFFEncoding.NONE;
        options.layers = false; options.alphaChannels = false;
        options.spotColors = false; options.embedColorProfile = true;
        doc.saveAs(new File(path), options, true, Extension.LOWERCASE);
    }
    try {
        for (var index = 0; index < cfg.jobs.length; index++) {
            var job = cfg.jobs[index];
            var folder = new Folder(output.fsName + '/' + job.id);
            if (!folder.exists && !folder.create()) throw new Error('Cannot create job folder');
            if (new File(folder.fsName + '/COMPLETE.txt').exists && !cfg.overwrite) continue;
            var sourceFile = new File(cfg.assets + '/' + job.id + '.png');
            if (!sourceFile.exists) throw new Error('Source image missing: ' + job.id);
            var source = track(app.open(sourceFile));
            var sw = source.width.as('px'), sh = source.height.as('px');
            var bleed = job.bleed || 0;
            var width = job.width + bleed * 2, height = job.height + bleed * 2;
            var doc = track(app.documents.add(mm(width), mm(height), 300, job.id, NewDocumentMode.RGB, DocumentFill.WHITE, 1, BitsPerChannelType.EIGHT, 'sRGB IEC61966-2.1'));
            app.activeDocument = source;
            source.flatten();
            var art = source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
            close(source); app.activeDocument = doc; doc.activeLayer = art;
            art.name = 'ART - generated original';
            var scale = Math.max(doc.width.as('px') / sw, doc.height.as('px') / sh);
            art.resize(scale * 100, scale * 100, AnchorPosition.MIDDLECENTER);
            var b = art.bounds;
            art.translate(px((doc.width.as('px') - b[0].as('px') - b[2].as('px')) / 2), px((doc.height.as('px') - b[1].as('px') - b[3].as('px')) / 2));
            executeAction(stringIDToTypeID('newPlacedLayer'), undefined, DialogModes.NO);
            var typeLayers = [];
            for (var n = 0; n < job.text.length; n++) typeLayers.push(addText(doc, job.text[n], job.color));
            var inset = bleed > 0 ? bleed : 3;
            doc.guides.add(Direction.VERTICAL, mm(inset));
            doc.guides.add(Direction.VERTICAL, mm(width - inset));
            doc.guides.add(Direction.HORIZONTAL, mm(inset));
            doc.guides.add(Direction.HORIZONTAL, mm(height - inset));
            var preview = track(doc.duplicate(job.id + '-preview'));
            preview.flatten();
            preview.saveAs(new File(folder.fsName + '/preview.png'), new PNGSaveOptions(), true, Extension.LOWERCASE);
            saveTiff(preview, folder.fsName + '/RGB.tif');
            preview.changeMode(ChangeMode.CMYK);
            var cmykProfile = preview.colorProfileName;
            saveTiff(preview, folder.fsName + '/CMYK.tif');
            close(preview);
            if (job.white) {
                var mask = track(app.documents.add(mm(width), mm(height), 300, job.id + '-white', NewDocumentMode.GRAYSCALE, DocumentFill.WHITE));
                mask.selection.selectAll(); mask.selection.fill(color('000000')); mask.selection.deselect();
                saveTiff(mask, folder.fsName + '/WHITE_MASK.tif'); close(mask);
                app.activeDocument = doc;
                var channel = doc.channels.add(); channel.name = 'UV_WHITE';
                channel.kind = ChannelType.SPOTCOLOR; channel.color = color('FFFFFF'); channel.opacity = 0;
                doc.activeChannels = [channel]; doc.selection.selectAll(); doc.selection.fill(color('000000')); doc.selection.deselect();
                channel.visible = false; doc.activeChannels = doc.componentChannels;
            }
            if (job.varnish) {
                var varnish = track(app.documents.add(mm(width), mm(height), 300, job.id + '-varnish', NewDocumentMode.GRAYSCALE, DocumentFill.WHITE));
                for (var t = 0; t < typeLayers.length; t++) {
                    app.activeDocument = doc;
                    var textCopy = typeLayers[t].duplicate(varnish, ElementPlacement.PLACEATBEGINNING);
                    app.activeDocument = varnish; textCopy.textItem.color = color('000000');
                }
                varnish.flatten(); saveTiff(varnish, folder.fsName + '/VARNISH_MASK.tif'); close(varnish);
            }
            app.activeDocument = doc;
            var psd = new PhotoshopSaveOptions(); psd.layers = true; psd.spotColors = true; psd.embedColorProfile = true;
            doc.saveAs(new File(folder.fsName + '/editable.psd'), psd, true, Extension.LOWERCASE);
            var effective = 300 / scale;
            var metadata = ['job=' + job.id, 'photoshop=' + app.version, 'trim_mm=' + job.width + 'x' + job.height,
                'bleed_mm=' + bleed, 'canvas_mm=' + width + 'x' + height, 'ppi=300', 'source_pixels=' + sw + 'x' + sh,
                'source_effective_ppi=' + effective.toFixed(1), 'cmyk_profile=' + cmykProfile, 'rgb_profile=sRGB IEC61966-2.1',
                'white=' + !!job.white, 'varnish=' + !!job.varnish, 'rip_validated=false', 'physical_print_validated=false'];
            write(folder.fsName + '/COMPLETE.txt', metadata.join('\n'));
            append(job.id + '\tOK\t' + width + '\t' + height + '\t' + effective.toFixed(1) + '\t' + cmykProfile);
            close(doc);
        }
        write(output.fsName + '/BATCH_COMPLETE.txt', 'Photoshop ' + app.version + '\nJobs requested: ' + cfg.jobs.length + '\nRIP and physical printing are not certified.');
    } catch (error) {
        append('ERROR\t' + String(error).replace(/[\t\r\n]/g, ' ') + '\tline=' + error.line);
        throw error;
    } finally {
        for (var d = owned.length - 1; d >= 0; d--) { try { owned[d].close(SaveOptions.DONOTSAVECHANGES); } catch (ignored) {} }
        app.displayDialogs = oldDialogs; app.preferences.rulerUnits = oldUnits; app.preferences.typeUnits = oldTypeUnits;
        if (initialDoc) { try { app.activeDocument = initialDoc; } catch (ignoredDoc) {} }
    }
}());

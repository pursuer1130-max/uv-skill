#target photoshop
(function () {
    if (typeof UV_JOB_CONFIG === 'undefined' || !UV_JOB_CONFIG.outputDir) throw new Error('UV_JOB_CONFIG.outputDir is required');
    var cfg = UV_JOB_CONFIG, prior = app.documents.length ? app.activeDocument : null;
    var units = app.preferences.rulerUnits, dialogs = app.displayDialogs;
    var doc = null, preview = null, check = null;
    var out = new Folder(cfg.outputDir);
    if (out.exists) throw new Error('Use a new job output directory; refusing to overwrite a completed job');
    if (!out.create()) throw new Error('Cannot create output directory');
    function rgb(hex) { var c = new SolidColor(); c.rgb.hexValue = hex; return c; }
    function label(text, x, y, points) {
        var layer = doc.artLayers.add(); layer.kind = LayerKind.TEXT;
        layer.textItem.contents = text; layer.textItem.font = 'ArialMT';
        layer.textItem.size = UnitValue(points, 'pt'); layer.textItem.position = [x,y];
        layer.textItem.color = rgb('222222');
    }
    try {
        app.displayDialogs = DialogModes.NO; app.preferences.rulerUnits = Units.PIXELS;
        if (cfg.demo === true) {
            doc = app.documents.add(1200, 800, 300, 'UV software test', NewDocumentMode.RGB, DocumentFill.WHITE);
            label('UV PIPELINE TEST', 65, 110, 15);
            var colors = ['00B8D4','E34789','F0CF23','262626','E8453C','42A86B'];
            for (var i=0; i<colors.length; i++) {
                var x=65+i*180; doc.artLayers.add().name = 'Patch ' + (i+1);
                doc.selection.select([[x,200],[x+165,200],[x+165,545],[x,545]]);
                doc.selection.fill(rgb(colors[i])); doc.selection.deselect();
            }
            label('1200 x 800 px  |  300 ppi  |  RGB', 65, 640, 7);
            label('SOFTWARE TEST ONLY - NOT A CALIBRATION TARGET', 65, 705, 6);
        } else {
            if (!prior) throw new Error('No artwork document is open');
            doc = prior.duplicate('UV export copy', false);
        }
        var sourceResolution=doc.resolution, minimumResolution=cfg.minResolution === undefined ? 300 : Number(cfg.minResolution);
        if (!isFinite(minimumResolution) || minimumResolution<300 || minimumResolution>2400) throw new Error('minResolution must be between 300 and 2400');
        if (sourceResolution<minimumResolution) doc.resizeImage(undefined,undefined,minimumResolution,ResampleMethod.NONE);
        var width=doc.width.as('px'), height=doc.height.as('px'), resolution=doc.resolution;
        var mode=String(doc.mode), channels=doc.channels.length, channelIdentity=[];
        for(var n=0;n<channels;n++)channelIdentity.push(doc.channels[n].name+'|'+String(doc.channels[n].kind));
        var psd = new PhotoshopSaveOptions(); psd.layers=true; psd.embedColorProfile=true;psd.spotColors=true;psd.alphaChannels=true;
        doc.saveAs(new File(out.fsName+'/artwork.psd'), psd, true, Extension.LOWERCASE);
        var tif = new TiffSaveOptions(); tif.imageCompression=TIFFEncoding.TIFFLZW;
        tif.embedColorProfile=true; tif.alphaChannels=true; tif.spotColors=true;
        doc.saveAs(new File(out.fsName+'/artwork.tif'), tif, true, Extension.LOWERCASE);
        preview=doc.duplicate('UV preview', false); preview.flatten();
        if (preview.mode !== DocumentMode.RGB) preview.changeMode(ChangeMode.RGB);
        preview.saveAs(new File(out.fsName+'/preview.png'), new PNGSaveOptions(), true, Extension.LOWERCASE);
        preview.close(SaveOptions.DONOTSAVECHANGES); preview=null;
        check=app.open(new File(out.fsName+'/artwork.tif'));
        if (check.width.as('px')!==width || check.height.as('px')!==height || check.resolution!==resolution || String(check.mode)!==mode || check.channels.length!==channels) {
            throw new Error('Export reopening metadata mismatch');
        }
        for(n=0;n<channels;n++)if(check.channels[n].name+'|'+String(check.channels[n].kind)!==channelIdentity[n])throw new Error('TIFF channel name/type mismatch');
        check.close(SaveOptions.DONOTSAVECHANGES);check=null;
        check=app.open(new File(out.fsName+'/artwork.psd'));
        if(check.channels.length!==channels)throw new Error('PSD channel count mismatch');
        for(n=0;n<channels;n++)if(check.channels[n].name+'|'+String(check.channels[n].kind)!==channelIdentity[n])throw new Error('PSD channel name/type mismatch');
        var report=new File(out.fsName+'/VERIFIED.txt'); report.encoding='UTF8';
        if (!report.open('w')) throw new Error('Cannot write validation result');
        report.write('photoshop_export=ok\nwidth='+width+'\nheight='+height+'\nppi='+resolution+'\nsource_ppi='+sourceResolution+'\nresampled=false\nrefit_after_import_required=true\nmode='+mode+'\nchannels='+channels+'\nprofile='+check.colorProfileName+'\nreopen=ok\npsd_reopen=ok\nchannel_names_and_types=matched\nchannel_identity='+channelIdentity.join(';')+'\nrip=unverified\nphysical_print=unverified\n');
        report.close();
        return out.fsName;
    } finally {
        if (check) { try { check.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} }
        if (preview) { try { preview.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} }
        if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} }
        if (prior) { try { app.activeDocument=prior; } catch (_) {} }
        app.preferences.rulerUnits=units; app.displayDialogs=dialogs;
    }
}());

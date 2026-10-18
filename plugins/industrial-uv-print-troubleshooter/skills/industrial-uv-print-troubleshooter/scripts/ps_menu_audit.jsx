#target photoshop
(function () {
    var started = new Date().getTime(), out = new Folder(Folder.desktop.fsName + '/PS_Menu_Test_' + started);
    if (!out.create()) throw new Error('Cannot create audit directory');
    var previous = app.documents.length ? app.activeDocument : null;
    var oldDialogs = app.displayDialogs, oldUnits = app.preferences.rulerUnits;
    var seed = null, current = null, results = [];
    function json(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'string') return '"' + v.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t').replace(/[\x00-\x1f]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);}) + '"';
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        var parts = [], k;
        if (v instanceof Array) { for(k=0;k<v.length;k++) parts.push(json(v[k])); return '['+parts.join(',')+']'; }
        for(k in v) if(v.hasOwnProperty(k)) parts.push(json(k)+':'+json(v[k]));
        return '{'+parts.join(',')+'}';
    }
    function write(name, value) { var f=new File(out.fsName+'/'+name); f.encoding='UTF8'; if(!f.open('w'))throw new Error('Cannot write '+name); f.write(value); f.close(); }
    function typeName(id) { try { var s=typeIDToStringID(id); if(s)return s; } catch(_){} try{return typeIDToCharID(id);}catch(_){return String(id);} }
    function descriptor(d) {
        var v={}; for(var i=0;i<d.count;i++){var k=d.getKey(i);v[typeName(k)]=value(d,k);} return v;
    }
    function value(d,k) {
        var t=d.getType(k);
        if(t===DescValueType.OBJECTTYPE)return descriptor(d.getObjectValue(k));
        if(t===DescValueType.LISTTYPE){var l=d.getList(k),a=[];for(var i=0;i<l.count;i++)a.push(value(l,i));return a;}
        if(t===DescValueType.STRINGTYPE)return d.getString(k);
        if(t===DescValueType.BOOLEANTYPE)return d.getBoolean(k);
        if(t===DescValueType.INTEGERTYPE)return d.getInteger(k);
        if(t===DescValueType.DOUBLETYPE)return d.getDouble(k);
        if(t===DescValueType.ENUMERATEDTYPE)return typeName(d.getEnumerationValue(k));
        return String(t);
    }
    function inventory(){var r=new ActionReference();r.putProperty(stringIDToTypeID('property'),stringIDToTypeID('menuBarInfo'));r.putEnumerated(stringIDToTypeID('application'),stringIDToTypeID('ordinal'),stringIDToTypeID('targetEnum'));return descriptor(executeActionGet(r));}
    function rgb(hex){var c=new SolidColor();c.rgb.hexValue=hex;return c;}
    function assert(ok,message){if(!ok)throw new Error(message||'Expected result not observed');}
    function run(group,name,fn){
        if(typeof UV_MENU_AUDIT_ONLY!=='undefined'){var selected=false;for(var j=0;j<UV_MENU_AUDIT_ONLY.length;j++)if(UV_MENU_AUDIT_ONLY[j]===name)selected=true;if(!selected)return;}
        var t=new Date().getTime(), result={group:group,name:name,status:'failed'};
        try {current=seed.duplicate('Audit - '+name,false); app.activeDocument=current; fn(current);result.status='verified';}
        catch(e){result.error=String(e);}
        finally {if(current){try{current.close(SaveOptions.DONOTSAVECHANGES);}catch(_){}current=null;} result.elapsed_ms=new Date().getTime()-t;results.push(result);write('tests.json',json(results));}
    }
    function changed(d,fn){var before=d.histogram.join(',');fn(d.activeLayer);assert(before!==d.histogram.join(','),'No histogram change observed');}
    function filter(name,method,args){run('Filter',name,function(d){changed(d,function(l){
        var x=new ActionDescriptor();
        if(name==='Emboss'){x.putInteger(charIDToTypeID('Angl'),45);x.putInteger(charIDToTypeID('Hght'),2);x.putInteger(charIDToTypeID('Amnt'),100);executeAction(charIDToTypeID('Embs'),x,DialogModes.NO);}
        else if(name==='Find edges')executeAction(charIDToTypeID('FndE'),x,DialogModes.NO);
        else if(name==='Mosaic'){x.putInteger(charIDToTypeID('ClSz'),9);executeAction(charIDToTypeID('Msc '),x,DialogModes.NO);}
        else if(name==='Solarize')executeAction(charIDToTypeID('Slrz'),x,DialogModes.NO);
        else l[method].apply(l,args||[]);
    });});}
    try {
        app.displayDialogs=DialogModes.NO;app.preferences.rulerUnits=Units.PIXELS;
        write('menus-original-context.json',json(inventory()));
        seed=app.documents.add(128,96,300,'Menu Audit Seed',NewDocumentMode.RGB,DocumentFill.WHITE);
        var layer=seed.artLayers.add();layer.name='Pattern';
        seed.selection.selectAll();seed.selection.fill(rgb('226F76'));seed.selection.deselect();
        seed.selection.select([[0,0],[63,0],[63,96],[0,96]]);seed.selection.fill(rgb('DF8640'));seed.selection.deselect();
        write('menus-rgb-document.json',json(inventory()));

        run('File','New document',function(d){assert(d.width.as('px')===128&&d.height.as('px')===96);});
        run('File','Duplicate document',function(d){assert(d.artLayers.length===2&&d.name.indexOf('Audit')===0);});
        function saveTest(name,ext,options){run('File',name,function(d){var f=new File(out.fsName+'/sample.'+ext);d.saveAs(f,options,true,Extension.LOWERCASE);assert(f.exists&&f.length>0);var reopened=app.open(f);try{assert(reopened.width.as('px')===128&&reopened.height.as('px')===96);}finally{reopened.close(SaveOptions.DONOTSAVECHANGES);}});}
        var po=new PhotoshopSaveOptions();po.layers=true;saveTest('Save and reopen PSD','psd',po);
        var to=new TiffSaveOptions();to.embedColorProfile=true;to.imageCompression=TIFFEncoding.TIFFLZW;saveTest('Save and reopen TIFF','tif',to);
        saveTest('Save and reopen PNG','png',new PNGSaveOptions());
        var jo=new JPEGSaveOptions();jo.quality=9;saveTest('Save and reopen JPEG','jpg',jo);
        saveTest('Save and reopen BMP','bmp',new BMPSaveOptions());
        run('File','Export Save for Web',function(d){var o=new ExportOptionsSaveForWeb();o.format=SaveDocumentType.PNG;o.PNG8=false;var f=new File(out.fsName+'/web.png');d.exportDocument(f,ExportType.SAVEFORWEB,o);assert(f.exists&&f.length>0);});

        run('Edit','Undo via history',function(d){var h=d.activeHistoryState,n=d.layers.length;d.artLayers.add();d.activeHistoryState=h;assert(d.layers.length===n);});
        run('Edit','Redo via history',function(d){var h=d.activeHistoryState,n=d.layers.length;d.artLayers.add();var h2=d.activeHistoryState;d.activeHistoryState=h;d.activeHistoryState=h2;assert(d.layers.length===n+1);});
        run('Edit','Fill',function(d){changed(d,function(){d.selection.selectAll();d.selection.fill(rgb('882277'));d.selection.deselect();});});
        run('Edit','Transform scale',function(d){d.activeLayer.resize(60,60,AnchorPosition.MIDDLECENTER);var b=d.activeLayer.bounds;assert(b[2].as('px')-b[0].as('px')<100);});
        run('Edit','Transform translate',function(d){var x=d.activeLayer.bounds[0].as('px');d.activeLayer.translate(10,4);assert(d.activeLayer.bounds[0].as('px')===x+10);});
        run('Edit','Transform rotate',function(d){d.activeLayer.rotate(90,AnchorPosition.MIDDLECENTER);var b=d.activeLayer.bounds;assert(b[2].as('px')-b[0].as('px')===96);});

        run('Image','Image size',function(d){d.resizeImage(UnitValue(64,'px'),UnitValue(48,'px'),600,ResampleMethod.BICUBIC);assert(d.width.as('px')===64&&d.resolution===600);});
        run('Image','Canvas size',function(d){d.resizeCanvas(UnitValue(150,'px'),UnitValue(110,'px'),AnchorPosition.MIDDLECENTER);assert(d.width.as('px')===150&&d.height.as('px')===110);});
        run('Image','Crop',function(d){d.crop([UnitValue(8,'px'),UnitValue(8,'px'),UnitValue(100,'px'),UnitValue(80,'px')]);assert(Math.abs(d.width.as('px')-92)<0.01&&Math.abs(d.height.as('px')-72)<0.01);});
        run('Image','Rotate canvas',function(d){d.rotateCanvas(90);assert(d.width.as('px')===96&&d.height.as('px')===128);});
        run('Image','Flip canvas',function(d){var h=d.activeHistoryState;d.flipCanvas(Direction.HORIZONTAL);assert(d.activeHistoryState!==h);});
        run('Image','Grayscale mode',function(d){d.changeMode(ChangeMode.GRAYSCALE);assert(d.mode===DocumentMode.GRAYSCALE);});
        run('Image','CMYK mode',function(d){d.changeMode(ChangeMode.CMYK);assert(d.mode===DocumentMode.CMYK);});
        run('Image','Lab mode',function(d){d.changeMode(ChangeMode.LAB);assert(d.mode===DocumentMode.LAB);});
        run('Image','16 bit mode',function(d){d.bitsPerChannel=BitsPerChannelType.SIXTEEN;assert(d.bitsPerChannel===BitsPerChannelType.SIXTEEN);});
        run('Image','32 bit mode',function(d){d.bitsPerChannel=BitsPerChannelType.THIRTYTWO;assert(d.bitsPerChannel===BitsPerChannelType.THIRTYTWO);});
        var adjustments=[['Invert','invert',[]],['Desaturate','desaturate',[]],['Brightness contrast','brightnessContrast',[20,10]],['Levels','adjustLevels',[10,240,1.1,0,255]],['Curves','adjustCurves',[[[0,0],[128,150],[255,255]]]],['Hue saturation','adjustHueSaturation',[15,10,0]],['Color balance','adjustColorBalance',[[5,0,0],[10,0,-5],[0,0,5],true]],['Posterize','posterize',[4]],['Threshold','threshold',[128]],['Equalize','equalize',[]],['Auto levels','autoLevels',[]],['Auto contrast','autoContrast',[]]];
        for(var a=0;a<adjustments.length;a++)(function(item){run('Image',item[0],function(d){changed(d,function(l){
            if(item[0]==='Brightness contrast'){l.adjustBrightnessContrast(20,10);}
            else if(item[0]==='Hue saturation'){var x=new ActionDescriptor(),list=new ActionList(),adjust=new ActionDescriptor();adjust.putInteger(charIDToTypeID('H   '),15);adjust.putInteger(charIDToTypeID('Strt'),10);adjust.putInteger(charIDToTypeID('Lght'),0);list.putObject(charIDToTypeID('Hst2'),adjust);x.putList(charIDToTypeID('Adjs'),list);x.putBoolean(charIDToTypeID('Clrz'),false);executeAction(charIDToTypeID('HStr'),x,DialogModes.NO);}
            else l[item[1]].apply(l,item[2]);
        });});}(adjustments[a]));

        run('Layer','New layer',function(d){var n=d.layers.length;d.artLayers.add();assert(d.layers.length===n+1);});
        run('Layer','Duplicate layer',function(d){var n=d.layers.length;d.activeLayer.duplicate();assert(d.layers.length===n+1);});
        run('Layer','Delete temporary layer',function(d){var l=d.artLayers.add(),n=d.layers.length;l.remove();assert(d.layers.length===n-1);});
        run('Layer','Rename',function(d){d.activeLayer.name='Renamed';assert(d.activeLayer.name==='Renamed');});
        run('Layer','Opacity',function(d){d.activeLayer.opacity=55;assert(Math.abs(d.activeLayer.opacity-55)<0.5);});
        run('Layer','Blend mode',function(d){d.activeLayer.blendMode=BlendMode.MULTIPLY;assert(d.activeLayer.blendMode===BlendMode.MULTIPLY);});
        run('Layer','Visibility',function(d){d.activeLayer.visible=false;assert(!d.activeLayer.visible);});
        run('Layer','Lock pixels',function(d){d.activeLayer.pixelsLocked=true;assert(d.activeLayer.pixelsLocked);});
        run('Layer','New group and move',function(d){var l=d.activeLayer,g=d.layerSets.add();l.move(g,ElementPlacement.INSIDE);assert(g.artLayers.length===1);});
        run('Layer','Merge down',function(d){d.activeLayer.merge();assert(d.layers.length===1);});
        run('Layer','Flatten',function(d){d.flatten();assert(d.layers.length===1&&d.activeLayer.isBackgroundLayer);});
        run('Layer','Smart object',function(d){executeAction(stringIDToTypeID('newPlacedLayer'),undefined,DialogModes.NO);assert(d.activeLayer.kind===LayerKind.SMARTOBJECT);});
        run('Layer','Mask reveal all',function(d){var x=new ActionDescriptor(),at=new ActionReference();x.putClass(charIDToTypeID('Nw  '),charIDToTypeID('Chnl'));at.putEnumerated(charIDToTypeID('Chnl'),charIDToTypeID('Chnl'),charIDToTypeID('Msk '));x.putReference(charIDToTypeID('At  '),at);x.putEnumerated(charIDToTypeID('Usng'),charIDToTypeID('UsrM'),charIDToTypeID('RvlA'));executeAction(charIDToTypeID('Mk  '),x,DialogModes.NO);var q=new ActionReference();q.putEnumerated(charIDToTypeID('Lyr '),charIDToTypeID('Ordn'),charIDToTypeID('Trgt'));assert(executeActionGet(q).getBoolean(stringIDToTypeID('hasUserMask')));});

        run('Type','Editable text and font',function(d){var l=d.artLayers.add();l.kind=LayerKind.TEXT;l.textItem.contents='Test';l.textItem.font='ArialMT';l.textItem.size=UnitValue(8,'pt');assert(l.textItem.contents==='Test'&&l.textItem.font==='ArialMT');});
        run('Type','Paragraph alignment',function(d){var l=d.artLayers.add();l.kind=LayerKind.TEXT;l.textItem.contents='Test';l.textItem.justification=Justification.CENTER;assert(l.textItem.justification===Justification.CENTER);});
        run('Type','Rasterize text',function(d){var l=d.artLayers.add();l.kind=LayerKind.TEXT;l.textItem.contents='Test';l.rasterize(RasterizeType.ENTIRELAYER);assert(l.kind===LayerKind.NORMAL);});

        run('Select','Select all',function(d){d.selection.selectAll();assert(d.selection.bounds[2].as('px')===128);});
        run('Select','Deselect',function(d){d.selection.selectAll();d.selection.deselect();var absent=false;try{d.selection.bounds;}catch(_){absent=true;}assert(absent);});
        function rectangle(d){d.selection.select([[20,20],[70,20],[70,60],[20,60]]);}
        run('Select','Inverse',function(d){rectangle(d);d.selection.invert();assert(d.selection.bounds[0].as('px')===0&&d.selection.bounds[2].as('px')===128);});
        run('Select','Expand',function(d){rectangle(d);d.selection.expand(4);assert(d.selection.bounds[0].as('px')===16);});
        run('Select','Contract',function(d){rectangle(d);d.selection.contract(4);assert(d.selection.bounds[0].as('px')===24);});
        run('Select','Feather',function(d){rectangle(d);var h=d.activeHistoryState;d.selection.feather(3);assert(d.activeHistoryState!==h);});
        run('Select','Border',function(d){rectangle(d);var h=d.activeHistoryState;d.selection.selectBorder(3);assert(d.activeHistoryState!==h);});
        run('Select','Save and load selection',function(d){rectangle(d);var ch=d.channels.add();ch.name='Audit selection';d.selection.store(ch);d.selection.deselect();d.selection.load(ch);assert(d.selection.bounds[0].as('px')===20);});
        run('Select','Create work path',function(d){rectangle(d);d.selection.makeWorkPath(2);assert(d.pathItems.length===1);});
        run('Channels','Spot channel',function(d){var n=d.channels.length,ch=d.channels.add();ch.kind=ChannelType.SPOTCOLOR;ch.name='UV_VARNISH_TEST';ch.color=rgb('111111');assert(d.channels.length===n+1&&ch.kind===ChannelType.SPOTCOLOR);});

        filter('Gaussian blur','applyGaussianBlur',[2]);filter('Motion blur','applyMotionBlur',[30,8]);filter('Radial blur','applyRadialBlur',[5,RadialBlurMethod.SPIN,RadialBlurQuality.GOOD]);
        filter('Average','applyAverage');filter('Blur','applyBlur');filter('Blur more','applyBlurMore');filter('Add noise','applyAddNoise',[8,NoiseDistribution.UNIFORM,true]);
        filter('Clouds','applyClouds');filter('Difference clouds','applyDifferenceClouds');filter('Emboss','applyEmboss',[45,2,100]);filter('Find edges','applyFindEdges');filter('High pass','applyHighPass',[2]);
        filter('Minimum','applyMinimum',[2]);filter('Maximum','applyMaximum',[2]);filter('Mosaic','applyMosaic',[9]);filter('Solarize','applySolarize');
        filter('Twirl','applyTwirl',[40]);filter('Pinch','applyPinch',[25]);filter('Spherize','applySpherize',[25,SpherizeMode.NORMAL]);filter('Ripple','applyRipple',[20,RippleSize.MEDIUM]);
        run('View','Add and remove guide',function(d){var g=d.guides.add(Direction.VERTICAL,UnitValue(20,'px'));assert(d.guides.length===1);g.remove();assert(d.guides.length===0);});
        run('Window','Switch active document',function(d){app.activeDocument=seed;assert(app.activeDocument===seed);app.activeDocument=d;assert(app.activeDocument===d);});
        write('summary.json',json({version:app.version,elapsed_ms:new Date().getTime()-started,tests:results.length,scope:'Complete menu inventory in original and RGB document contexts; isolated document operations only. Script/API success is not a UI-click test of every menu command.',unexecuted:'Print; quit; external/network help; account; third-party interactive plugins; device-dependent acquisition; 3D; video; persistent preferences; unlisted contextual commands.'}));
        write('COMPLETE.txt','Audit finished. See tests.json and menu inventories.');
        return out.fsName;
    } finally {
        if(current){try{current.close(SaveOptions.DONOTSAVECHANGES);}catch(_){}}
        if(seed){try{seed.close(SaveOptions.DONOTSAVECHANGES);}catch(_){}}
        app.preferences.rulerUnits=oldUnits;app.displayDialogs=oldDialogs;
        if(previous){try{app.activeDocument=previous;}catch(_){}}
    }
}());

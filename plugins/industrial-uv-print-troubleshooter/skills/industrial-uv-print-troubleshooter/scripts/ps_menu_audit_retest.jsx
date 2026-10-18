#target photoshop
var UV_MENU_AUDIT_ONLY = ['Crop','Brightness contrast','Hue saturation','Opacity','Mask reveal all','Emboss','Find edges','Mosaic','Solarize'];
try {
    $.evalFile(new File(new File($.fileName).parent.fsName + '/ps_menu_audit.jsx'));
} finally {
    delete UV_MENU_AUDIT_ONLY;
}

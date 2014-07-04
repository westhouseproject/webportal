$( "#okBtn" ).button().bind( "click", function() {
	document.getElementById("settings").className = "settingoff";
});

$( "#cancelBtn" ).button().bind( "click", function() {
	document.getElementById("settings").className = "settingoff";
});

$(function() {
	$( "#tabs" ).tabs();
});

$(function() {
    $( "#radio1" ).buttonset();
});

$(function() {
    $( "#radio2" ).buttonset();
});
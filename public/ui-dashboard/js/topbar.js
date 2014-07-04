var w = 2048;
var ht = 80;
var topsvg;
var settingBtn;
var temp;
var icon;
var month=new Array("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec");
var currentTime = new Date();
var settingOn;

$(function () {
	var deferred = $.ajax({
		url: 'http://api.worldweatheronline.com/free/v1/weather.ashx?q=Vancouver&format=json&num_of_days=1&key=cnbxw8rgpkutghrgwsuxx34d',
		dataType: 'jsonp',
		async: false,
		contentType: "application/json",
	});

	deferred.success(function (data) {
		getWeatherData(data);
		drawTop();
		drawWeather();
	
    	var interval = setInterval(function() {
			$(function () {
				var deferred = $.ajax({
		    		url: 'http://api.worldweatheronline.com/free/v1/weather.ashx?q=Vancouver&format=json&num_of_days=1&key=cnbxw8rgpkutghrgwsuxx34d',
		    		dataType: 'jsonp',
		    		async: false,
		    		contentType: "application/json",
				});

				deferred.success(function (data) {
					getWeatherData(data);
					updateWeather();	
		  	});
		});}, 3600000);	//update weather info every hour
	});
});

function init(){
	var status = document.getElementById("settings").className;
	if(status == "settingoff")
		settingOn = false;
	else
		settingOn = true;
}

function getWeatherData(data){
	temp = data.data.current_condition[0].temp_C;
	icon = data.data.current_condition[0].weatherIconUrl[0].value;
	console.log(temp + " " + icon);
} 

function drawWeather(){
	var datestring = month[currentTime.getMonth()] +" "+ currentTime.getDate() + ", " + currentTime.getFullYear();
	
	weather = topsvg.append("g").attr("class", "weather"); 
		
	weather.append("image")
	    .attr("x", 1550)
	    .attr("y", 10)
        .attr("width", 60)
        .attr("height", 60)
        .attr("xlink:href", icon);
	
	weather.append("text")
		.attr("x", 1620)
		.attr("y", 60)
		.attr("class", "weathertext")
		.attr("xml:space", "preserve")
		.text(temp+"\u2103  " + datestring);

}

function updateWeather(){
	currentTime = new Date();
	var datestring = month[currentTime.getMonth()] + " " + currentTime.getDate() + ", " + currentTime.getFullYear();
	
	weather.select("text")
		.transition()
		.text(temp+"\u2103  " + datestring);
	
	weather.select("image")
		.transition()
		.attr("xlink:href", icon);
}

function drawTop() {
    topsvg = d3.select("#topsvg")
        .attr("width", w)
        .attr("height", ht);

	topsvg.append("svg:rect")
	    .attr("x", 0)
	    .attr("y", 0)
	    .attr("width", w)
	    .attr("height", ht)		
		.attr("class", "topbg");
	
	topsvg.append("svg:text")
		.attr("x", 15)
		.attr("y", 60)
		.attr("class", "logo")
		.text("WestHouse");
		
	settingBtn = topsvg.append("g").style("cursor", "pointer");
	
	var settingIcon = settingBtn.append("svg:image")
	    .attr("x", 1978)
	    .attr("y", 10)
	    .attr("width", 60)
	    .attr("height", 60)		
		.attr("class", "setting")
		.attr("xlink:href", "image/setting.png"); 
	
	settingIcon.append("svg:title")
		.text("Settings");
		
	settingBtn.on("mouseup", function(evt){
		init();
		if(!settingOn){
			document.getElementById("settings").className = "settingon";
			settingOn = true;
		}
		else{
			document.getElementById("settings").className = "settingoff";
			settingOn = false;
		}
	});
	
}


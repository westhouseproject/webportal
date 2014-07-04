var w = 2048;
var h = 200;
var svg;
var menuBtn;
var btn1, btn2, btn3, btn4, btn5, btn6;
var select = new Array(true, false, false, false, false, false);
var btns = new Array();
var btnWidth = (w-15*7)/6;
var btnHeight = h-30;
var ishide = true;

drawMenu();

function drawMenu() {
    svg = d3.select("#menusvg")
        .attr("width", w)
        .attr("height", h);
				
	svg.append("rect")
	    .attr("x", 0)
	    .attr("y", 0)
	    .attr("width", w)
	    .attr("height", h)		
		.attr("class", "menubg");
		
	btn1 = svg.append("g").style("cursor", "pointer");	
	btn1.append("rect")
		.attr("x", 15)
		.attr("y", 15)
		.attr("rx", 10)
		.attr("ry", 10)
	    .attr("width", btnWidth)
	    .attr("height", btnHeight)
		.attr("class", "menuBtnSelect");
		
	btn1.append("text")
		.attr("x", 15+btnWidth/2)
		.attr("y", 35+btnHeight/2)
		.text("Dashboard")
		.attr("class", "menuTextSelect");
		
	btns.push(btn1);
		
	btn1.on("mouseup", function(evt){
		menuSelect(0);
		document.getElementById('frame').src = "dashboard/index.html";
	});
	
		
	btn2 = svg.append("g").style("cursor", "pointer");	
	btn2.append("rect")
		.attr("x", 15*2+btnWidth)
		.attr("y", 15)
		.attr("rx", 10)
		.attr("ry", 10)
	    .attr("width", btnWidth)
	    .attr("height", btnHeight)
		.attr("class", "menuBtn");		
		
	btn2.append("text")
		.attr("x", 15*2+btnWidth+btnWidth/2)
		.attr("y", 35+btnHeight/2)
		.text("Controls")
		.attr("class", "menuText");	
		
	btns.push(btn2);	
	
	btn2.on("mouseup", function(evt){
		menuSelect(1);
	});
 
	btn3 = svg.append("g").style("cursor", "pointer");	
	btn3.append("rect")
		.attr("x", 15*3+btnWidth*2)
		.attr("y", 15)
		.attr("rx", 10)
		.attr("ry", 10)
	    .attr("width", btnWidth)
	    .attr("height", btnHeight)
		.attr("class", "menuBtn");		
	
	btn3.append("text")
		.attr("x", 15*3+btnWidth*2+btnWidth/2)
		.attr("y", 35+btnHeight/2)
		.text("House")
		.attr("class", "menuText");		
		
	btns.push(btn3);	
	
	btn3.on("mouseup", function(evt){
		menuSelect(2);
	});
		
	btn4 = svg.append("g").style("cursor", "pointer");	
	btn4.append("rect")
		.attr("x", 15*4+btnWidth*3)
		.attr("y", 15)
		.attr("rx", 10)
		.attr("ry", 10)
	    .attr("width", btnWidth)
	    .attr("height", btnHeight)
		.attr("class", "menuBtn");		
		
	btn4.append("text")
		.attr("x", 15*4+btnWidth*3+btnWidth/2)
		.attr("y", 35+btnHeight/2)
		.text("Calendar")
		.attr("class", "menuText");		
	
	btns.push(btn4);	
	
	btn4.on("mouseup", function(evt){
		menuSelect(3);
	});	
		
	btn5 = svg.append("g").style("cursor", "pointer");	
	btn5.append("rect")
		.attr("x", 15*5+btnWidth*4)
		.attr("y", 15)
		.attr("rx", 10)
		.attr("ry", 10)
	    .attr("width", btnWidth)
	    .attr("height", btnHeight)
		.attr("class", "menuBtn");		
		
	btn5.append("text")
		.attr("x", 15*5+btnWidth*4+btnWidth/2)
		.attr("y", 35+btnHeight/2)
		.text("MyData")
		.attr("class", "menuText");	 	
		
	btns.push(btn5);	
	
	btn5.on("mouseup", function(evt){
		menuSelect(4);
		document.getElementById('frame').src = "https://www.bchydro.com/accounts-billing.html";
	});	
		
	btn6 = svg.append("g").style("cursor", "pointer");	
	btn6.append("rect")
		.attr("x", 15*6+btnWidth*5)
		.attr("y", 15)
		.attr("rx", 10)
		.attr("ry", 10)
	    .attr("width", btnWidth)
	    .attr("height", btnHeight)
		.attr("class", "menuBtn");		
		
	btn6.append("text")
		.attr("x", 15*6+btnWidth*5+btnWidth/2)
		.attr("y", 35+btnHeight/2)
		.text("Social")
		.attr("class", "menuText");		
		
	btns.push(btn6);	
	
	btn6.on("mouseup", function(evt){
		menuSelect(5);
		document.getElementById('frame').src = "image/social.png";
	});

	menuBtn = svg.append("g").style("cursor", "pointer");	
	menuBtn.append("image")
    	.attr("x", w/2-40)
    	.attr("y", -20)
    	.attr("width", 80)
    	.attr("height", 80)
		.attr("xlink:href", "image/down.png");
					
	menuBtn.on("mouseup", function(evt){
		if(ishide)
			hide();
		else
			show();
	});
}

function menuSelect(i){
	for(var j = 0; j < select.length; j++){
		if(j != i) {
			select[j] = false;
			btns[j].select("rect").attr("class", "menuBtn");
			btns[j].select("text").attr("class", "menuText");
		}
	}
	if(!select[i]){
		btns[i].select("rect").attr("class", "menuBtnSelect");
		btns[i].select("text").attr("class", "menuTextSelect");
		select[i] = true;
	}
	/*else{
		btns[i].select("rect").attr("class", "menuBtn");
		btns[i].select("text").attr("class", "menuText");
		select[i] = false;
	}*/
}

function hide(){
	svg.select("rect")
		.transition()
	    .duration(300)
		.attr("y", h*9/10)
		.attr("height", h/10);
		
	menuBtn.select("image")
		.transition()
    	.duration(300)
    	.attr("x", w/2-40)
    	.attr("y", h*9/10-40)
		.attr("xlink:href", "image/up.png");
		
	svg.selectAll(".menuBtn")
		.transition()
		.duration(300)
		.attr("y", h*9/10+15);
		
	svg.selectAll(".menuBtnSelect")
		.transition()
		.duration(300)
		.attr("y", h*9/10+15);

	svg.selectAll(".menuText")
		.transition()
		.duration(300)
		.attr("y", h*9/10+80);
		
	svg.selectAll(".menuTextSelect")
		.transition()
		.duration(300)
		.attr("y", h*9/10+80);
	//document.getElementById("menu").className="menuhide";	
	ishide = false;
}

function show(){
	svg.select("rect")
		.transition()
	    .duration(300)
		.attr("y", 0)
		.attr("height", h);
		
	menuBtn.select("image")
		.transition()
    	.duration(300)
    	.attr("x", w/2-40)
    	.attr("y", -20)
		.attr("xlink:href", "image/down.png");
		
	svg.selectAll(".menuBtn")
		.transition()
		.duration(300)
		.attr("y", 15);		
	
	svg.selectAll(".menuBtnSelect")
		.transition()
		.duration(300)
		.attr("y", 15);	
	
	svg.selectAll(".menuText")
		.transition()
		.duration(300)
		.attr("y", 35+btnHeight/2);	
	
	svg.selectAll(".menuTextSelect")
		.transition()
		.duration(300)
		.attr("y", 35+btnHeight/2);
	//document.getElementById("menu").className="menuopen";
	ishide = true;
}
(function () {

  $.ajax({
    url: '/consumptions/' + window.dashboard.uuid
  }).done(function (json) {
    drawGraph(json);
  }).fail(function () {
    console.log('failed');
  });

  function drawGraph(data) {
    /* implementation heavily influenced by http://bl.ocks.org/1166403 */
    
    // define dimensions of graph
    var m = [100, 50, 50, 50]; // margins
    var w = 1000 - m[1] - m[3]; // width
    var h = 400 - m[0] - m[2]; // height

    // X scale will fit all values from data[] within pixels 0-w
    var x = d3.scale.linear().domain([0, data.length]).range([0, w]);
	var xs = d3.scale.ordinal().domain(["2:00", "4:00", "6:00", "8:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"]).rangeRoundBands([0, w]);
    // Y scale will fit values from 0-10 within pixels h-0 (Note the inverted domain for the y-scale: bigger is up!)
    var y = d3.scale.linear().domain([0, 5]).range([h, 0]);
      // automatically determining max range can work something like this
      // var y = d3.scale.linear().domain([0, d3.max(data)]).range([h, 0]);

    // create a line function that can convert data[] into x and y points
    var line = d3.svg.line()
      // assign the X function to plot our line as we wish
      .x(function(d,i) { 
        // verbose logging to show what's actually being done
        console.log('Plotting X value for data point: ' + d.kw + ' using index: ' + i + ' to be at: ' + x(i) + ' using our xScale.');
        // return the X coordinate where we want to plot this datapoint
        return x(i); 
      })
      .y(function(d) { 
        // verbose logging to show what's actually being done
        console.log('Plotting Y value for data point: ' + d.kw + ' to be at: ' + y(d.kw) + " using our yScale.");
        // return the Y coordinate where we want to plot this datapoint
        return y(d.kwh_difference); 
      })

      // Add an SVG element with the desired dimensions and margin.
      var graph = d3.select("#graph").append("svg:svg")
            .attr("width", w + m[1] + m[3])
            .attr("height", h + m[0] + m[2])
            //.attr("viewBox", "0 0 " + w + " " + h )
            //.attr("preserveAspectRatio", "xMidYMid meet")
          .append("svg:g")
            .attr("transform", "translate(" + m[3] + "," + m[0] + ")");
			
	  graph.append("svg:rect")
	  		.attr("class", "box")
	  	  	.attr("x", 0)
	  		.attr("y", 0)
	  		.attr("width", w + m[1] + m[3])
	  		.attr("height", h + m[0] + m[2])
			.attr("transform", "translate(-" + m[3] + ",-" + m[0] + ")");

      // create yAxis
      //var xAxis = d3.svg.axis().scale(x).tickSize(-h).tickSubdivide(true);
	  var xAxis = d3.svg.axis().scale(xs).tickSize(-h).tickSubdivide(true);
      // Add the x-axis.
      graph.append("svg:g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + h + ")")
            .call(xAxis);

	  graph.append("svg:line")
	  		.attr("class", "xline")
	  		.attr("x1", 0)
			.attr("y1", h)
			.attr("x2", w)
			.attr("y2", h)
			.attr("transform", "translate(-1,0)");

      // create left yAxis
      var yAxisLeft = d3.svg.axis().scale(y).ticks(4).orient("left");
      // Add the y-axis to the left
      graph.append("svg:g")
            .attr("class", "y axis")
            .attr("transform", "translate(-2,0)")
            .call(yAxisLeft);
      
      // Add the line by appending an svg:path element with the data line we created above
      // do this AFTER the axes above so that the line is above the tick-lines
      graph.append("svg:path").attr("d", line(data));
	  
	    
	  //title 
	  graph.append("svg:text")
	  	.attr("class", "title")
		.attr("x", 0)
		.attr("y", 0)
		.text("Power Consumption / Time")
		.attr("transform", "translate(-"+m[1]/2+", -"+m[0]/2+")");
		
  	  graph.append("svg:text")
  	  	.attr("class", "axis name")
  		.attr("x", 0)
  		.attr("y", 0)
  		.text("kw")
  		.attr("transform", "translate(-25, -15)");
		
      graph.append("svg:text")
   	  	.attr("class", "axis name")
   		.attr("x", 0)
   		.attr("y", 0)
   		.text("time")
   		.attr("transform", "translate("+w+", "+(h+17)+")");
  }

})();
(function(){

// AAAAAARGH model

	//var graph = raw.models.graph();
var graph = raw.model();

    var steps = graph.dimension('steps')
      .title('Steps')
      .multiple(true)
      .required(2)

    var size = graph.dimension('size')
      .title('Size')
      .types(Number)
      .accessor(function (d){ return +d; })

    var individuals = graph.dimension('individuals')
        .title('Individuals')
        .multiple(false)
        .required(1)

    graph.map(function (data){
      //console.log(individuals()[0]);

      var d = { nodes: [], links: [], individuals: [] }

      if (!steps() || steps().length < 2) return d;

      var n = [], l = [], ind = [], si, ti;

      for (var i=0; i < steps().length-1; i++ ) {

        var sg = steps()[i]
        var tg = steps()[i+1]
        var relations = d3.nest()
          .key(function (d) { return d[sg] } )
          .key(function (d) { return d[tg] } )
          .entries(data)

        relations.forEach(function (s){
          si = getNodeIndex(n, s.key, sg);

          if ( si == -1) {
            n.push({ name : s.key, group : sg })
            si = n.length-1;
          }

          s.values.forEach(function (t){
            //console.log(t);
            ti = getNodeIndex(n, t.key, tg)
            if (ti == -1) {
              n.push({ name : t.key, group : tg })
              ti = n.length-1;
            }
            var value = size() ? d3.sum(t.values, function (d){ return +size(d); }) : t.values.length;
            var link = { source : n[si], target : n[ti], value : value };
            l.push(link);
            // CUSTOM
            var individuals_list = JSON.parse(t.values[0][individuals()[0]]);
            //console.log(individuals_list);
            for (var offset in individuals_list) {
              var individual = { targeted_link : link, name : individuals_list[offset].name, present : individuals_list[offset].present, community_offset : offset, total_individuals : individuals_list.length };
              ind.push(individual);
            }
          })

        })
      }


      d.nodes = n.sort(customSort);
      l.forEach(function (d){ d.source = n.indexOf(d.source); d.target = n.indexOf(d.target)});
      d.links = l;
      //ind.forEach(function (d){ d.targeted_link = l.indexOf(d.targeted_link); });
      d.individuals = ind;
      return d;

    })

    function customSort(a, b) {
      var Item1 = a.group;
      var Item2 = b.group;
      if(Item1 != Item2){
          return (Item1.localeCompare(Item2));
      }
      else{
          return (a.name.localeCompare(b.name));
      }
    }

    function sortByGroup(a,b){
      if(a.group < b.group) return -1;
      if(a.group > b.group) return 1;
      return 0;
    }

    function getNodeIndex(array, name, group) {
      for (var i in array){
        var a = array[i]
        if (a['name'] == name && a['group'] == group) {
          return i;
        }
      }
      return -1;
    }

// -----------------------------------------------------------------------------

	var chart = raw.chart()
		.title('Alluvial Diagram (custom)')
		.description(
            "Alluvial diagrams allow to represent flows and to see correlations between categorical dimensions, visually linking to the number of elements sharing the same categories. It is useful to see the evolution of cluster (such as the number of people belonging to a specific group). It can also be used to represent bipartite graphs, using each node group as dimensions.<br/>Mainly based on DensityDesign's work with Fineo, it is inspired by <a href='http://bost.ocks.org/mike/sankey/'>http://bost.ocks.org/mike/sankey/</a>")
		.thumbnail("imgs/alluvial.png")
		.category("Multi categorical - Customized version")
		.model(graph)

	var width = chart.number()
		.title("Width")
		.defaultValue(1000)
		.fitToWidth(true)

	var height = chart.number()
		.title("Height")
		.defaultValue(500)

	var nodeWidth = chart.number()
		.title("Community Width")
		.defaultValue(5)

	var sortBy = chart.list()
        .title("Sort by")
        .values(['size','name','automatic'])
        .defaultValue('size')

	var colors = chart.color()
		.title("Color scale")

/*  var individualColors = chart.color()
		.title("Individuals color scale")*/

/*    var individualNodeHeight = chart.number()
        .title("Indidivual nodes height dividing factor")
        .defaultValue(10)*/

/*    var individualNodePadding = chart.number()
        .title("Indidivual nodes padding factor")
        .defaultValue(1)*/

/*    var individualNodeOffset = chart.number()
        .title("Indidivual nodes padding offset from given flow top")
        .defaultValue(1)*/

	chart.draw(function (selection, data){

   console.log(data);

		var formatNumber = d3.format(",.0f"),
		    format = function(d) { return formatNumber(d); };

		var g = selection
		    .attr("width", +width() )
		    .attr("height", +height() + 20 )
		  	.append("g")
		    .attr("transform", "translate(" + 0 + "," + 10 + ")");

		// Calculating the best nodePadding

		var nested = d3.nest()
	    	.key(function (d){ return d.group; })
	    	.rollup(function (d){ return d.length; })
	    	.entries(data.nodes)

	    var maxNodes = d3.max(nested, function (d){ return d.values; });

		var sankey = d3.sankey()
		    .nodeWidth(+nodeWidth())
		    .nodePadding(d3.min([10,(height()-maxNodes)/maxNodes]))
		    .size([+width(), +height()]);

		var path = sankey.link(),
			nodes = data.nodes,
			links = data.links,
      individuals = data.individuals;

		sankey
	   		.nodes(nodes)
	    	.links(links)
	    	.layout(32);

	    // Re-sorting nodes

	    nested = d3.nest()
	    	.key(function(d){ return d.group; })
	    	.map(nodes)

	    d3.values(nested)
	    	.forEach(function (d){
		    	var y = ( height() - d3.sum(d,function(n){ return n.dy+sankey.nodePadding();}) ) / 2 + sankey.nodePadding()/2;
		    	d.sort(function (a,b){
		    		if (sortBy() == "automatic") return b.y - a.y;
		    		if (sortBy() == "size") return b.dy - a.dy;
		    		if (sortBy() == "name") return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
		    	})
		    	d.forEach(function (node){
		    		node.y = y;
		    		y += node.dy +sankey.nodePadding();
		    	})
		    })

	    // Resorting links

		d3.values(nested).forEach(function (d){

			d.forEach(function (node){

	    		var ly = 0;
	    		node.sourceLinks
		    		.sort(function (a,b){
		    			return a.target.y - b.target.y;
		    		})
		    		.forEach(function (link){
		    			link.sy = ly;
		    			ly += link.dy;
		    		})

		    	ly = 0;

		    	node.targetLinks
		    		.sort(function(a,b){
		    			return a.source.y - b.source.y;
		    		})
		    		.forEach(function (link){
		    			link.ty = ly;
		    			ly += link.dy;
		    		})
			})
		})

    // Making individuals values
    var indivi_colors = {};
    var filtered_individuals = [];
    var nested_individuals = {};
    var key = -1;

    for (var ind_offset in individuals) {
      d = individuals[ind_offset];

      if (!(d.name in indivi_colors))
        indivi_colors[d.name] = "rgb("+(255*(1-d.community_offset/d.total_individuals))+', 200, '+(255*d.community_offset/d.total_individuals)+")";

      if (d.community_offset == 0) {
        ++key;
        nested_individuals[key] = [];
      }

      if (d.present)
        nested_individuals[key].push(d)
    }

    for (var nested_offset in nested_individuals) {
      d = nested_individuals[nested_offset];
      var total = d.length;
      for (var offset in d) {
        d[offset].community_offset = offset;
        d[offset].total_individuals = total;
        filtered_individuals.push(d[offset]);
      }
    }

    console.log(filtered_individuals);
		/*individuals.sort(function(a,b){
		  if (links.indexOf(a.targeted_link) < links.indexOf(b.targeted_link))
		    return 1;
		  else if (links.indexOf(a.targeted_link) > links.indexOf(b.targeted_link))
		    return -1;
		  else if (a.name < b.name)
		    return 1;
		  else if (a.name > b.name)
		    return -1;
		  else
		    return 0;
		});*/
// padding of 10 (px ??) between nodes => next node y coordinate is current_node.y+current_node.dy+10.
	 	colors.domain(links, function (d){ return d.source.name; });

		var link = g.append("g").selectAll(".link")
	    	.data(links)
	   		.enter().append("path")
			    .attr("class", "link")
			    .attr("d", path )
			    .style("stroke-width", function(d) { return Math.max(1, d.dy); })
			    .style("fill","none")
			    .style("stroke", function (d){ return colors()(d.source.name); })
			    .style("stroke-opacity",".4")
			    .sort(function(a, b) { return b.dy - a.dy; })
			    .append("title")
			    .text(function(d) { console.log(d); return d.value});

		var node = g.append("g").selectAll(".node")
	    	.data(nodes)
	    	.enter().append("g")
		      	.attr("class", "node")
		      	.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })

		node.append("rect")
		    .attr("height", function(d) { return d.dy; })
		    .attr("width", sankey.nodeWidth())
		    .style("fill", function (d) { return d.sourceLinks.length ? colors(d.name) : "#666"; })
		    .append("title")
		    	.text(function(d) { return d.name + "\n" + format(d.value); });

		node.append("text")
		    .attr("x", -6)
	      	.attr("y", function (d) { return d.dy / 2; })
	      	.attr("dy", ".35em")
	      	.attr("text-anchor", "end")
	      	.attr("transform", null)
			    .text(function(d) { return d.name; })
			    .style("font-size","11px")
				.style("font-family","Arial, Helvetica")
			    .style("pointer-events","none")
			    .filter(function(d) { return d.x < +width() / 2; })
			    .attr("x", 6 + sankey.nodeWidth())
		     	.attr("text-anchor", "start");


    var individual = g.append("g").selectAll(".individual")
      .data(filtered_individuals)
      .enter().append("g")
        .attr("class", "individual")
        .attr("transform", function(d) { return "translate(" + d.targeted_link.source.x + "," + (d.targeted_link.source.y + d.targeted_link.sy) + ")"; });

   individual.append("rect")
    .attr("height", function(d) { return d.targeted_link.dy/d.total_individuals; })
    .attr("width", sankey.nodeWidth())
    .attr("y", function(d) { return d.community_offset*(d.targeted_link.dy/d.total_individuals); })
    .style("fill", function(d) { return d.present ? indivi_colors[d.name] : "#666"; });
	})

})();

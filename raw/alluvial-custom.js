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
        .title('Individuals (same order as steps)')
        .multiple(true)
        .required(2)

    graph.map(function (data){
      //console.log(individuals()[0]);

      var d = { nodes: [], links: [], source_individuals: [], target_individuals: [] }

      if (!steps() || steps().length < 2) return d;

      var n = [], l = [], src_ind = [], tgt_ind = [], si, ti;

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

            // === CUSTOM ===
            var source_individuals_list = JSON.parse(t.values[0][individuals()[0]]);
            for (var offset in source_individuals_list) {
              var individual = { targeted_link : link, name : source_individuals_list[offset].name, present : source_individuals_list[offset].present, community_offset : offset, total_individuals : source_individuals_list.length };
              src_ind.push(individual);
            }

            var target_individuals_list = JSON.parse(t.values[0][individuals()[1]]);
            for (var offset in target_individuals_list) {
              var individual = { targeted_link : link, name : target_individuals_list[offset].name, present : target_individuals_list[offset].present, community_offset : offset, total_individuals : target_individuals_list.length };
              tgt_ind.push(individual);
            }
            // =============
          })

        })
      }


      d.nodes = n.sort(customSort);
      l.forEach(function (d){ d.source = n.indexOf(d.source); d.target = n.indexOf(d.target) });
      d.links = l;
      //ind.forEach(function (d){ d.targeted_link = l.indexOf(d.targeted_link); });
      d.source_individuals = src_ind;
      d.target_individuals = tgt_ind;
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
		.category("Multi categorical")
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
      source_individuals = data.source_individuals,
      target_individuals = data.target_individuals;

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

    // === Making individuals values ===
    // Hardcoded colors from IWantHue
    var color_palette = [
    ["#c77c80"],
    ["#ab6bb7", "#aba554"],
    ["#a6b64d", "#9d6dcb", "#cc7b6f"],
    ["#cb6745", "#9b5cd2", "#94be5b", "#b57eb4"],
    ["#cb5c85", "#9ec94a", "#966ace", "#6dbc90", "#c4773f"]
    ];

    var name_to_color = {};

    var filtered_source_individuals = [];
    var nested_source_individuals = {};
    var src_key = -1;

    for (var src_ind_offset in source_individuals) {
      d = source_individuals[src_ind_offset];

      if (!(d.name in name_to_color))
        name_to_color[d.name] = d.total_individuals < 6 ?
          color_palette[d.total_individuals-1][d.community_offset] :
          "rgb("+(255*(1-d.community_offset/d.total_individuals))+', '+ 200 /*(100 * (1+ d.community_offset%2))*/+', '+(255*d.community_offset/d.total_individuals)+")";

      if (d.community_offset == 0) {
        ++src_key;
        nested_source_individuals[src_key] = [];
      }

      if (d.present)
        nested_source_individuals[src_key].push(d)
    }

    for (var nested_source_offset in nested_source_individuals) {
      d = nested_source_individuals[nested_source_offset];
      var total = d.length;
      for (var offset in d) {
        d[offset].community_offset = offset;
        d[offset].total_individuals = total;
        filtered_source_individuals.push(d[offset]);
      }
    }

    var filtered_target_individuals = [];
    var nested_target_individuals = {};
    var tgt_key = -1;

    for (var tgt_ind_offset in target_individuals) {
      d = target_individuals[tgt_ind_offset];

      if (!(d.name in name_to_color))
        name_to_color[d.name] = d.total_individuals < 6 ?
          color_palette[d.total_individuals-1][d.community_offset] :
          "rgb("+(255*(1-d.community_offset/d.total_individuals))+', '+ 200 /*(100 * (1+ d.community_offset%2))*/+', '+(255*d.community_offset/d.total_individuals)+")";

      if (d.community_offset == 0) {
        ++tgt_key;
        nested_target_individuals[tgt_key] = [];
      }

      if (d.present)
        nested_target_individuals[tgt_key].push(d)
    }

    for (var nested_target_offset in nested_target_individuals) {
      d = nested_target_individuals[nested_target_offset];
      var total = d.length;
      for (var offset in d) {
        d[offset].community_offset = offset;
        d[offset].total_individuals = total;
        filtered_target_individuals.push(d[offset]);
      }
    }

  //  Correct nodes x coordinate
  for (var node_offset in nodes) {
    d = nodes[node_offset];
    if (d.x == 0)
      d.x += 1*sankey.nodeWidth();
    else
      d.x -= 1*sankey.nodeWidth();
  }

    // ==================================

//    console.log(filtered_source_individuals);
//    console.log(filtered_target_individuals);
// padding of 10 (px ??) between nodes => next node y coordinate is current_node.y+current_node.dy+10.
	 	colors.domain(links, function (d){ return d.source.name; });

		var link = g.append("g").selectAll(".link")
	    	.data(links)
	   		.enter().append("path")
			    .attr("class", "link")
			    .attr("d", path)
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
		    .style("fill", function (d) { return "#FFF"; })
		    .append("title")
		    	.text(function(d) { return d.name + "\n" + format(d.value); });

		node.append("text")
		    .attr("x", sankey.nodeWidth())
	      	.attr("y", function (d) { return d.dy / 2; })
	      	.attr("dy", ".35em")
	      	.attr("text-anchor", "end")
	      	.attr("transform", null)
			    .text(function(d) { return d.name; })
			    .style("font-size","11px")
				.style("font-family","Arial, Helvetica")
			    .style("pointer-events","none")
			    .filter(function(d) { return d.x < +width() / 2; })
			    .attr("x", 0)
		     	.attr("text-anchor", "start");


    var src_individual = g.append("g").selectAll(".src_individual")
      .data(filtered_source_individuals)
      .enter().append("g")
        .attr("class", "src_individual")
        .attr("transform", function(d) { return "translate(" + (d.targeted_link.source.x - 1*sankey.nodeWidth()) + "," + (d.targeted_link.source.y + d.targeted_link.sy) + ")"; });

    src_individual.append("rect")
      .attr("height", function(d) { return d.targeted_link.dy/d.total_individuals; })
      .attr("width", sankey.nodeWidth())
      .attr("y", function(d) { return d.community_offset*(d.targeted_link.dy/d.total_individuals); })
      .style("fill", function(d) { return d.present ? name_to_color[d.name] : "#666"; });

    src_individual.append("text")
		    .attr("x", 3 + 2*sankey.nodeWidth())
	      .attr("y", function (d) { return (d.community_offset)*(d.targeted_link.dy/d.total_individuals) + d.targeted_link.dy/(2*d.total_individuals); })
	      .attr("dy", ".35em")
	      .attr("transform", null)
			  .text(function(d) { return d.name; })
			  .style("font-size", function(d) { return Math.min(11, d.targeted_link.dy/(1.1*d.total_individuals))+"px"; })
				.style("font-family","Arial, Helvetica")
			  .style("pointer-events","none")
		    .attr("text-anchor", "start");

// TODO: display on hover ?
    var tgt_individual = g.append("g").selectAll(".tgt_individual")
      .data(filtered_target_individuals)
      .enter().append("g")
        .attr("class", "tgt_individual")
        .attr("transform", function(d) { return "translate(" + (d.targeted_link.target.x + 1*sankey.nodeWidth()) + "," + (d.targeted_link.target.y + d.targeted_link.ty) + ")"; });
//        .style("hover text", function(d) {"display: block"});

    tgt_individual.append("rect")
      .attr("height", function(d) { return d.targeted_link.dy/d.total_individuals; })
      .attr("width", sankey.nodeWidth())
      .attr("y", function(d) { return d.community_offset*(d.targeted_link.dy/d.total_individuals); })
      .style("fill", function(d) { return d.present ? name_to_color[d.name] : "#666"; });

    tgt_individual.append("text")
		    .attr("x", -3 -sankey.nodeWidth())
	      .attr("y", function (d) { return (d.community_offset)*(d.targeted_link.dy/d.total_individuals) + d.targeted_link.dy/(2*d.total_individuals); })
	      .attr("dy", ".35em")
	      .attr("text-anchor", "end")
	      .attr("transform", null)
			  .text(function(d) { return d.name; })
			  .style("font-size", function(d) { return Math.min(11, d.targeted_link.dy/(1.1*d.total_individuals))+"px"; })
				.style("font-family","Arial, Helvetica")
			  .style("pointer-events","none")

	})

})();

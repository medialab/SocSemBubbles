(function() {

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
    .accessor(function(d) {
      return +d;
    })

  var individuals = graph.dimension('individuals')
    .title('Individuals (same order as steps)')
    .multiple(true)
    .required(2)

  graph.map(function(data) {
    //console.log(individuals()[0]);

    var d = {
      nodes: [],
      links: [],
      sourceIndividuals: [],
      targetIndividuals: []
    }

    if (!steps() || steps().length < 2) return d;

    var n = [],
      l = [],
      srcInd = [],
      tgtInd = [],
      si, ti;

    for (var i = 0; i < steps().length - 1; i++) {

      var sg = steps()[i]
      var tg = steps()[i + 1]
      var relations = d3.nest()
        .key(function(d) {
          return d[sg]
        })
        .key(function(d) {
          return d[tg]
        })
        .entries(data)

      relations.forEach(function(s) {
        si = getNodeIndex(n, s.key, sg);

        if (si == -1) {
          n.push({
            name: s.key,
            group: sg
          })
          si = n.length - 1;
        }

        s.values.forEach(function(t) {
          //console.log(t);
          ti = getNodeIndex(n, t.key, tg)
          if (ti == -1) {
            n.push({
              name: t.key,
              group: tg
            })
            ti = n.length - 1;
          }
          var value = size() ? d3.sum(t.values, function(d) {
            return +size(d);
          }) : t.values.length;
          var link = {
            source: n[si],
            target: n[ti],
            value: value
          };
          l.push(link);

          // === CUSTOM ===
          var sourceIndividualsList = JSON.parse(t.values[0][individuals()[0]]);
          for (var offsetSrc in sourceIndividualsList) {
            var indName = sourceIndividualsList[offsetSrc].name;
            var individual = {
              targetedLink: link,
              name: indName,
              present: sourceIndividualsList[offsetSrc].present,
              communityOffset: Number(offsetSrc),
              totalIndividuals: sourceIndividualsList.length
            };
            srcInd.push(individual);
          }

          var targetIndividualsList = JSON.parse(t.values[0][individuals()[1]]);
          for (var offsetTgt in targetIndividualsList) {
            var indName = targetIndividualsList[offsetTgt].name;
            var individual = {
              targetedLink: link,
              name: indName,
              present: targetIndividualsList[offsetTgt].present,
              communityOffset: Number(offsetTgt),
              totalIndividuals: targetIndividualsList.length
            };
            tgtInd.push(individual);
          }
          // =============
        })

      })
    }


    d.nodes = n.sort(customSort);
    l.forEach(function(d) {
      d.source = n.indexOf(d.source);
      d.target = n.indexOf(d.target)
    });
    d.links = l;
    //ind.forEach(function (d){ d.targetedLink = l.indexOf(d.targetedLink); });
    d.sourceIndividuals = srcInd;
    d.targetIndividuals = tgtInd;
    return d;

  })

  function customSort(a, b) {
    var Item1 = a.group;
    var Item2 = b.group;
    if (Item1 != Item2) {
      return (Item1.localeCompare(Item2));
    } else {
      return (a.name.localeCompare(b.name));
    }
  }

  function getNodeIndex(array, name, group) {
    for (var i in array) {
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
    .description("Alluvial diagrams allow to represent flows and to see correlations between categorical dimensions, visually linking to the number of elements sharing the same categories. It is useful to see the evolution of cluster (such as the number of people belonging to a specific group). It can also be used to represent bipartite graphs, using each node group as dimensions.<br/>Mainly based on DensityDesign's work with Fineo, it is inspired by <a href='http://bost.ocks.org/mike/sankey/'>http://bost.ocks.org/mike/sankey/</a>")
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
    .values(['size', 'name', 'automatic'])
    .defaultValue('size')

  var colors = chart.color()
    .title("Color scale")

  var mosaicWidth = chart.number()
    .title("Mosaic width")
    .defaultValue(50)

  var mosaicHeight = chart.number()
    .title("Mosaic height")
    .defaultValue(10)

  chart.draw(function(selection, data) {

    console.log(data);

    var formatNumber = d3.format(",.0f"),
      format = function(d) {
        return formatNumber(d);
      };

    var g = selection
      .attr("width", +width())
      .attr("height", +height() + 20)
      .append("g")
      .attr("transform", "translate(" + 0 + "," + 10 + ")");

    // Calculating the best nodePadding

    var nested = d3.nest()
      .key(function(d) {
        return d.group;
      })
      .rollup(function(d) {
        return d.length;
      })
      .entries(data.nodes)

    var maxNodes = d3.max(nested, function(d) {
      return d.values;
    });

    var sankey = d3.sankey()
      .nodeWidth(+nodeWidth())
      .nodePadding(d3.min([10, (height() - maxNodes) / maxNodes]))
      .size([+width(), +height()]);

    var path = sankey.link(),
      nodes = data.nodes,
      links = data.links,
      sourceIndividuals = data.sourceIndividuals,
      targetIndividuals = data.targetIndividuals;

    sankey
      .nodes(nodes)
      .links(links)
      .layout(32);

    // Re-sorting nodes

    nested = d3.nest()
      .key(function(d) {
        return d.group;
      })
      .map(nodes)

    d3.values(nested)
      .forEach(function(d) {
        var y = (height() - d3.sum(d, function(n) {
          return n.dy + sankey.nodePadding();
        })) / 2 + sankey.nodePadding() / 2;
        d.sort(function(a, b) {
          if (sortBy() == "automatic") return b.y - a.y;
          if (sortBy() == "size") return b.dy - a.dy;
          if (sortBy() == "name") return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        })
        d.forEach(function(node) {
          node.y = y;
          y += node.dy + sankey.nodePadding();
        })
      })

    // Resorting links

    d3.values(nested).forEach(function(d) {

      d.forEach(function(node) {

        var ly = 0;
        node.sourceLinks
          .sort(function(a, b) {
            return a.target.y - b.target.y;
          })
          .forEach(function(link) {
            link.sy = ly;
            ly += link.dy;
          })

        ly = 0;

        node.targetLinks
          .sort(function(a, b) {
            return a.source.y - b.source.y;
          })
          .forEach(function(link) {
            link.ty = ly;
            ly += link.dy;
          })
      })
    })

    // === Making individuals values ===

    var nameToOpacity = {}

    var filteredSourceIndividuals = [];
    var nestedSourceIndividuals = {};
    var srcKey = -1;

    for (var srcIndOffset in sourceIndividuals) {
      d = sourceIndividuals[srcIndOffset];

      if (!(d.name in nameToOpacity))
        nameToOpacity[d.name] = (d.communityOffset+1)/d.totalIndividuals;

      if (d.communityOffset == 0) {
        ++srcKey;
        nestedSourceIndividuals[srcKey] = [];
      }

      if (d.present)
        nestedSourceIndividuals[srcKey].push(d)
    }

    for (var nestedSourceOffset in nestedSourceIndividuals) {
      d = nestedSourceIndividuals[nestedSourceOffset];
      var total = d.length;
      for (var offset in d) {
        var fD = {
        communityOffset: Number(offset),
        totalIndividuals: total,
        targetedLink: d[offset].targetedLink,
        name: d[offset].name
        };
        filteredSourceIndividuals.push(fD);
      }
    }

    var filteredTargetIndividuals = [];
    var nestedTargetIndividuals = {};
    var tgtKey = -1;

    for (var tgtIndOffset in targetIndividuals) {
      d = targetIndividuals[tgtIndOffset];

      if (!(d.name in nameToOpacity))
        nameToOpacity[d.name] = (d.communityOffset+1)/d.totalIndividuals;

      if (d.communityOffset == 0) {
        ++tgtKey;
        nestedTargetIndividuals[tgtKey] = [];
      }

      if (d.present)
        nestedTargetIndividuals[tgtKey].push(d)
    }

    for (var nestedTargetOffset in nestedTargetIndividuals) {
      d = nestedTargetIndividuals[nestedTargetOffset];
      var total = d.length;
      for (var offset in d) {
        var fD = {
        communityOffset: Number(offset),
        totalIndividuals: total,
        targetedLink: d[offset].targetedLink,
        name: d[offset].name
        };
        filteredTargetIndividuals.push(fD);
      }
    }

    // === Computing individuals' mosaic ===

    var mosaicDict = {};

    sourceArray = [sourceIndividuals, targetIndividuals]
    targetKeyArray = ['target', 'source']
    for (var srcOffset in sourceArray) {
      var srcAr = sourceArray[srcOffset];
      var targetNodeOffset = targetKeyArray[srcOffset];
      var sourceNodeOffset = targetKeyArray[1-srcOffset];
      for (var offset in srcAr) {
        var srcNode = srcAr[offset];
        if (!(srcNode.name in mosaicDict)) {
          mosaicDict[srcNode.name] = {'name':srcNode.name, 'sourceNode': srcNode.targetedLink[sourceNodeOffset], 'reachedTarget': {}, reachedTargetSize: 0}
          for (var nestedOffset in nodes) {
            var currentNode = nodes[nestedOffset];
            if (currentNode.group === srcNode.targetedLink[targetNodeOffset].group) {
              mosaicDict[srcNode.name].reachedTarget[currentNode.name] = false;
              mosaicDict[srcNode.name].reachedTargetSize += 1;
            }
          }
        }
        if (srcNode.present)
          mosaicDict[srcNode.name].reachedTarget[srcNode.targetedLink[targetNodeOffset].name] = true;
      }
    }

    // === Initialisation of mosaic sorting ===
    var mosaicKeyArrayByGroup = {};
    var todoStack = [];
    var somethingHappenedByGroup = {};
    var firstPushedIndividualByGroup = {};
    for (var key in mosaicDict) {
      if (mosaicDict.hasOwnProperty(key)) {
        var groupKey = mosaicDict[key].sourceNode.group + mosaicDict[key].sourceNode.name;
        todoStack.push(mosaicDict[key]);
        somethingHappenedByGroup[groupKey] = true;
        firstPushedIndividualByGroup[groupKey] = null;
      }
    }
    todoStack.sort(function (a, b) {
      var aReachedCount = 0;
      var bReachedCount = 0;

      for (var k in a.reachedTarget)
        if (a.reachedTarget.hasOwnProperty(k))
          if (a.reachedTarget[k])
            ++aReachedCount;

      for (var k in b.reachedTarget)
        if (b.reachedTarget.hasOwnProperty(k))
          if (b.reachedTarget[k])
            ++bReachedCount;

      return bReachedCount - aReachedCount;
    });
    console.log(todoStack);
    // DEBUG: todoStack is correctly sorted
    // === Effective sorting ===
    // TODO: check if we're doing a complete todoStack repushing.
    // If so, push a random one, and reiterate (as they are
    // completely disjoint from current sorted shit,
    // we don't care about unshifting or pushing).
    while (todoStack.length !== 0) {
      var currentIndividual = todoStack.shift();
      console.log(currentIndividual);
      console.log(mosaicKeyArrayByGroup);
      var currentGroup = currentIndividual.sourceNode.group + currentIndividual.sourceNode.name;
      var stackCycle = (currentIndividual === firstPushedIndividualByGroup[currentGroup] && !somethingHappenedByGroup[currentGroup]);
      //console.log(mosaicKeyArrayByGroup);
      if (stackCycle) {
        // This individual isn't aligned with anything since we've done
        // a complete no-op stack cycle, so no-brain pushing
        mosaicKeyArrayByGroup[currentGroup].push(currentIndividual.name);
        // Resetting variables detecting a no-op stack cycle
        somethingHappenedByGroup[currentGroup] = true;
        firstPushedIndividualByGroup[currentGroup] = null;
      }

      else {
        if (!(currentGroup in mosaicKeyArrayByGroup)) {
          mosaicKeyArrayByGroup[currentGroup] = [currentIndividual.name];
          somethingHappenedByGroup[currentGroup] = true;
        }

        else if (mosaicKeyArrayByGroup[currentGroup].length === 1) {
          mosaicKeyArrayByGroup[currentGroup].push(currentIndividual.name);
          somethingHappenedByGroup[currentGroup] = true;
        }

        else {
          var maxJaccardAlignmentValue = 0;
          // Here upper and lower means a "stack-geometric" up and down:
          // 0 is he uppest, length-1 the lowest
          var maxJaccardAlignmentIndividualUpperIndex;
          var maxJaccardAlignmentIndividualLowerIndex;
          // Jaccard alignement
          for (var alignedIndividualsOffset in mosaicKeyArrayByGroup[currentGroup]) {
            //console.log(mosaicKeyArrayByGroup[currentGroup][alignedIndividualsOffset]);
            var currentAlignedIndividual = mosaicDict[mosaicKeyArrayByGroup[currentGroup][alignedIndividualsOffset]];
            //console.log(currentAlignedIndividual);
            var intersectionCount = 0;
            var unionCount = 0;
            for (var reachedTargetKey in currentIndividual.reachedTarget) {
              if (currentIndividual.reachedTarget.hasOwnProperty(reachedTargetKey)) {
                if (currentIndividual.reachedTarget[reachedTargetKey]
                && currentAlignedIndividual.reachedTarget[reachedTargetKey])
                  ++intersectionCount;
                if (currentIndividual.reachedTarget[reachedTargetKey]
                || currentAlignedIndividual.reachedTarget[reachedTargetKey])
                  ++unionCount;
              }
            }
            var currentJaccardValue = unionCount ? intersectionCount/unionCount: 0;
            if (currentJaccardValue >= maxJaccardAlignmentValue) {
              maxJaccardAlignmentIndividualLowerIndex = Number(alignedIndividualsOffset);
              maxJaccardAlignmentIndividualUpperIndex = currentJaccardValue > maxJaccardAlignmentValue ?
                maxJaccardAlignmentIndividualLowerIndex : maxJaccardAlignmentIndividualUpperIndex;
              maxJaccardAlignmentValue = currentJaccardValue;
            }
          }
          if (currentGroup === 'Concept_target0')
            console.log(maxJaccardAlignmentIndividualIndex, currentIndividual.name, mosaicKeyArrayByGroup[currentGroup][maxJaccardAlignmentIndividualIndex]);
          if (!maxJaccardAlignmentValue) { // Maybe we will be lucky next time
            todoStack.push(currentIndividual);
            if (firstPushedIndividualByGroup[currentGroup] === null) {
              firstPushedIndividualByGroup[currentGroup] = currentIndividual;
              somethingHappenedByGroup[currentGroup] = false;
            }
          }

          else if (maxJaccardAlignmentIndividualUpperIndex === 0) {
            // don't care, unshift
            mosaicKeyArrayByGroup[currentGroup].unshift(currentIndividual.name);
            somethingHappenedByGroup[currentGroup] = true;
          }

          else if (maxJaccardAlignmentIndividualLowerIndex === mosaicKeyArrayByGroup[currentGroup].length-1) {
            mosaicKeyArrayByGroup[currentGroup].push(currentIndividual.name);
            somethingHappenedByGroup[currentGroup] = true;
          }

          else {
            // !!! HACKY !!!
            var maxJaccardAlignmentIndividualIndex = maxJaccardAlignmentIndividualUpperIndex;
            // Compare the two neighboors
            //upperNeighboor
            //console.log(maxJaccardAlignmentIndividualIndex);
            var neighboorsIndexArray = [maxJaccardAlignmentIndividualIndex-1, maxJaccardAlignmentIndividualIndex+1];
            console.log(neighboorsIndexArray);
            var neighboorIntersectionCount = 0;
            var neighboorUnionCount = 0;
            var resultValue = [];
            for (var neighboorsIndexArrayIndex in neighboorsIndexArray) {
              var neighboorsIndex = neighboorsIndexArray[neighboorsIndexArrayIndex];
              //console.log(neighboorsIndex);
              //console.log(mosaicKeyArrayByGroup[currentGroup][neighboorsIndex]);
              var currentAlignedIndividual = mosaicDict[mosaicKeyArrayByGroup[currentGroup][neighboorsIndex]];
              var intersectionCount = 0;
              var unionCount = 0;
              for (var reachedTargetKey in currentIndividual.reachedTarget) {
                if (currentIndividual.reachedTarget.hasOwnProperty(reachedTargetKey)) {
                  if (currentIndividual.reachedTarget[reachedTargetKey]
                  && currentAlignedIndividual.reachedTarget[reachedTargetKey])
                    ++intersectionCount;
                  if (currentIndividual.reachedTarget[reachedTargetKey]
                  || currentAlignedIndividual.reachedTarget[reachedTargetKey])
                    ++unionCount;
                }
                resultValue.push(unionCount ? intersectionCount/unionCount : 0);
              }
            }
            var spliceOffset = resultValue[1] > resultValue[0] ? 1 : 0;
            mosaicKeyArrayByGroup[currentGroup].splice(maxJaccardAlignmentIndividualIndex+spliceOffset, 0, currentIndividual.name);
            somethingHappenedByGroup[currentGroup] = true;
          }
        }
      }
    }

    console.log(mosaicDict);

    mosaicArray = [];
    perNodeYOffset = {};
    for (var group in mosaicKeyArrayByGroup) {
      if (mosaicKeyArrayByGroup.hasOwnProperty(group)) {
        for (var individualNameIndex in mosaicKeyArrayByGroup[group]) {
          var key = mosaicKeyArrayByGroup[group][individualNameIndex];
          var sourceNodeName = mosaicDict[key].sourceNode.name + mosaicDict[key].sourceNode.group;
          if (!(sourceNodeName in perNodeYOffset))
            perNodeYOffset[sourceNodeName] = 0;

          var reachedTargets = mosaicDict[key].reachedTarget;
          for (var reachedTargetKey in reachedTargets) {
            if (reachedTargets.hasOwnProperty(reachedTargetKey)) {
              var mosaic = {
                'name': key,
                'dy': perNodeYOffset[sourceNodeName],
                'dx': Number(reachedTargetKey), // UGLY !
                'present': reachedTargets[reachedTargetKey],
                'sourceNode': mosaicDict[key].sourceNode,
                'targetSize': mosaicDict[key].reachedTargetSize
              };
              mosaicArray.push(mosaic);
            }
          }
          perNodeYOffset[sourceNodeName] += 1;
        }
      }
    }
    /*
    for (var key in mosaicDict) {
      if (mosaicDict.hasOwnProperty(key)) {

        var sourceNodeName = mosaicDict[key].sourceNode.name + mosaicDict[key].sourceNode.group;
        if (!(sourceNodeName in perNodeYOffset))
          perNodeYOffset[sourceNodeName] = 0;

        var reachedTargets = mosaicDict[key].reachedTarget;
        for (var reachedTargetKey in reachedTargets) {
          if (reachedTargets.hasOwnProperty(reachedTargetKey)) {
            var mosaic = {
              'name': key,
              'dy': perNodeYOffset[sourceNodeName],
              'dx': Number(reachedTargetKey), // UGLY !
              'present': reachedTargets[reachedTargetKey],
              'sourceNode': mosaicDict[key].sourceNode,
              'targetSize': mosaicDict[key].reachedTargetSize
            };
            mosaicArray.push(mosaic);
          }
        }
        perNodeYOffset[sourceNodeName] += 1;
      }
    }
    */
    console.log(mosaicArray);
    console.log(perNodeYOffset);

  //  Correct nodes x coordinate
    for (var nodeOffset in nodes) {
      d = nodes[nodeOffset];
      if (d.x == 0)
        d.x = d.x + 2 * sankey.nodeWidth() + mosaicWidth();
      else
        d.x = d.x - (2 * sankey.nodeWidth() + mosaicWidth());
    }


    // ==================================

    //    console.log(filteredSourceIndividuals);
    //    console.log(filteredTargetIndividuals);
    // padding of 10 (px ??) between nodes => next node y coordinate is currentNode.y+currentNode.dy+10.
    colors.domain(links, function(d) {
      return d.source.name;
    });

    colors.domain(links, function(d) {
      return d.target.name;
    });

    var ldefs = g.append("defs").selectAll(".def")
      .data(links)
      .enter().append("linearGradient")
      .attr("id", function(d) {return d.source.name + d.target.name;});
      ldefs.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", function(d) { return colors()(/*d.source.group +*/ d.source.name); });
      ldefs.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", function(d) { return colors()(/*d.target.group + */d.target.name); })

    var link = g.append("g").selectAll(".link")
      .data(links)
      .enter();

      link.append("path")
      .attr("class", "link")
      .attr("d", path)
      .style("stroke-width", function(d) {
        return Math.max(1, d.dy);
      })
      .style("fill", "none")
      .style("stroke", function(d) {
        //return /*"linear-gradient(to right, "+*/colors()(d.source.group + d.source.name)/*+", blue)"*/;
        //return "url(#"+d.source.name + d.target.name+")";
        return colors()(d.source.name);
      })
      .style("stroke-opacity", ".4")
      .sort(function(a, b) {
        return b.dy - a.dy;
      })
      .append("title")
      .text(function(d) {
        console.log(d);
        return d.value
      });

    var node = g.append("g").selectAll(".node")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node")
      .attr("transform", function(d) {
        return "translate(" + d.x + "," + d.y + ")";
      })

    node.append("rect")
      .attr("height", function(d) {
        return d.dy;
      })
      .attr("width", sankey.nodeWidth())
      .style("fill", function(d) {
        return "#FFF";
      })
      .append("title")
      .text(function(d) {
        return d.name + "\n" + format(d.value);
      });

    node.append("text")
      .attr("x", sankey.nodeWidth())
      .attr("y", function(d) {
        return d.dy / 2;
      })
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .attr("transform", null)
      .text(function(d) {
        return d.name;
      })
      .style("font-size", "11px")
      .style("font-family", "Arial, Helvetica")
      .style("pointer-events", "none")
      .filter(function(d) {
        return d.x < +width() / 2;
      })
      .attr("x", 0)
      .attr("text-anchor", "start");


    var srcIndividual = g.append("g").selectAll(".srcIndividual")
      .data(filteredSourceIndividuals)
      .enter().append("g")
      .attr("class", "srcIndividual")
      .attr("transform", function(d) {
        return "translate(" + (d.targetedLink.source.x - 1 * sankey.nodeWidth()) + "," + (d.targetedLink.source.y + d.targetedLink.sy) + ")";
      });

    srcIndividual.append("rect")
      .attr("height", function(d) {
        return d.targetedLink.dy / d.totalIndividuals;
      })
      .attr("width", sankey.nodeWidth())
      .attr("y", function(d) {
        return d.communityOffset * (d.targetedLink.dy / d.totalIndividuals);
      })
      .style("fill", function(d) {
        //return colors()(d.targetedLink.source.group + d.targetedLink.source.name)
        return colors()(d.targetedLink.source.name)
      })
      .style("opacity", function(d) {
        return nameToOpacity[d.name];
      });

    srcIndividual.append("text")
      .attr("x", 3 + 2 * sankey.nodeWidth())
      .attr("y", function(d) {
        return (d.communityOffset + 1/2) * (d.targetedLink.dy / d.totalIndividuals);
      })
      .attr("dy", ".35em")
      .attr("transform", null)
      .text(function(d) {
        return d.name;
      })
      .style("font-size", function(d) {
        return Math.min(11, d.targetedLink.dy / (1.1 * d.totalIndividuals)) + "px";
      })
      .style("font-family", "Arial, Helvetica")
      .style("pointer-events", "none")
      .attr("text-anchor", "start");

    // TODO: display on hover ?
    var tgtIndividual = g.append("g").selectAll(".tgtIndividual")
      .data(filteredTargetIndividuals)
      .enter().append("g")
      .attr("class", "tgtIndividual")
      .attr("transform", function(d) {
        return "translate(" + (d.targetedLink.target.x + 1 * sankey.nodeWidth()) + "," + (d.targetedLink.target.y + d.targetedLink.ty) + ")";
      });

    tgtIndividual.append("rect")
      .attr("height", function(d) {
        return d.targetedLink.dy / d.totalIndividuals;
      })
      .attr("width", sankey.nodeWidth())
      .attr("y", function(d) {
        return d.communityOffset * (d.targetedLink.dy / d.totalIndividuals);
      })
      .style("fill", function(d) {
        return colors()(d.targetedLink.target.name);
      })
       .style("opacity", function(d) {
        return nameToOpacity[d.name];
      });

    tgtIndividual.append("text")
      .attr("x", -3 - sankey.nodeWidth())
      .attr("y", function(d) {
        return (d.communityOffset + 1/2) * (d.targetedLink.dy / d.totalIndividuals);
      })
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .attr("transform", null)
      .text(function(d) {
        return d.name;
      })
      .style("font-size", function(d) {
        return Math.min(11, d.targetedLink.dy / (1.1 * d.totalIndividuals)) + "px";
      })
      .style("font-family", "Arial, Helvetica")
      .style("pointer-events", "none")

    var mosaic = g.append("g").selectAll(".mosaic")
      .data(mosaicArray)
      .enter().append("g")
      .attr("class", "mosaic")
      .attr("transform", function(d) {
        return "translate("+ (d.sourceNode.x + 3*sankey.nodeWidth()) + "," + d.sourceNode.y + ")";
      });
      var sourceMosaic = mosaic.filter(function(d) {
        return d.sourceNode.x < +width() / 2;
      })
      .attr("transform", function(d) {
        return "translate("+ (d.sourceNode.x - 2*sankey.nodeWidth() - mosaicWidth()) + "," + d.sourceNode.y + ")";
      });

    mosaic.append("rect")
    .attr("height", function(d) {
      var boxHeight = d.sourceNode.dy/perNodeYOffset[d.sourceNode.name + d.sourceNode.group];
      return Math.min(mosaicHeight(), boxHeight/2);
    })
    .attr("width", function (d) { return (mosaicWidth()/d.targetSize); })
    .attr("y", function(d) {
      return (d.dy /*+1/2*/)*(d.sourceNode.dy/(perNodeYOffset[d.sourceNode.name + d.sourceNode.group]))/* - Math.min(10, d.sourceNode.dy/perNodeYOffset[d.sourceNode.name + d.sourceNode.group])/2*/;
     })
    .attr("x", function(d) {
      return d.dx*(mosaicWidth()/d.targetSize);
    })
    .style("fill", "AAA")
    .style("opacity", function(d) {
      return d.present ? 1 : 0.4;
    });

    mosaic.append("text")
    .attr("y", function(d) {
      var boxHeight = d.sourceNode.dy/perNodeYOffset[d.sourceNode.name + d.sourceNode.group];
      var h = Math.min(mosaicHeight(), boxHeight/2);
      return (d.dy)*(boxHeight) + 1.5*h;
    })
    .attr("dy", ".35em")
    .attr("transform", null)
    .text(function(d) {
      return d.name;
    })
    .style("font-size", function(d) {
      var boxHeight = d.sourceNode.dy/perNodeYOffset[d.sourceNode.name + d.sourceNode.group];
      return Math.min(mosaicHeight(), boxHeight/2) + "px";
    })
    .style("font-family", "Arial, Helvetica")
    .style("pointer-events", "none")
    .attr("text-anchor", "start");

  })

})();
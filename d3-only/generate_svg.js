// Trick borrowed from here:
// https://css-tricks.com/snippets/javascript/htmlentities-for-javascript/
function xmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const fs = require('fs');

json = JSON.parse(fs.readFileSync(process.argv[2]));
svgFile = fs.createWriteStream(process.argv[3]);

// Is there any link from source community to target community ?
  var blocDisplay = {};
  for (var lineOffset in json['matrix']) {
    for (var columnOffset in json['matrix'][lineOffset]) {
      var currentBool = json['matrix'][lineOffset][columnOffset];
      var sourceCategory = json['sources'][lineOffset].community_category;
      var targetCategory = json['targets'][columnOffset].community_category;
      var key = (""+sourceCategory) + ',' + (""+targetCategory);
      if (key in blocDisplay) {
        blocDisplay[key].displayed = blocDisplay[key].displayed || currentBool;
      }
      else {
        blocDisplay[key] = {};
        blocDisplay[key].displayed = currentBool;
        blocDisplay[key].sources = {};
        blocDisplay[key].targets = {};
        blocDisplay[key].targetsCount = 0;
        blocDisplay[key].sourcesCount = 0;
      }
      if (currentBool) {
        var sourceKey = json['sources'][lineOffset].node;
        var targetKey = json['targets'][columnOffset].node;
        if (!(sourceKey in blocDisplay[key].sources)) {
          blocDisplay[key].sources[sourceKey] = true;
          blocDisplay[key].sourcesCount += 1;
        }
        if (!(targetKey in blocDisplay[key].targets)) {
          blocDisplay[key].targets[targetKey] = true;
          blocDisplay[key].targetsCount += 1;
        }
      }
    }
  }


  console.log(blocDisplay);

  var sourcesExtent = [];
  var targetsIntent = [];

  for (var sourceOffset in json['matrix']) {
    var sourceNumeric = Number(sourceOffset);
    if (sourceNumeric >= sourcesExtent.length)
      sourcesExtent.push(0);
    for (var targetOffset in json['matrix'][sourceOffset]) {
      var target_numeric = Number(targetOffset);
      if (target_numeric >= targetsIntent.length)
        targetsIntent.push(0);
      var currentBool = json['matrix'][sourceOffset][targetOffset];
      if (currentBool) {
        sourcesExtent[sourceNumeric] += 1;
        targetsIntent[target_numeric] += 1;
      }
    }
  }

  console.log(sourcesExtent, targetsIntent);

  var sourceCommunityExtent = [];
  var oldCommunity = null;
  var communityExtentSum = 0;
  for (var sourceOffset in json['sources']) {
    var currentCommunity = json['sources'][sourceOffset].community_category;
    if (currentCommunity != oldCommunity) {
      if (oldCommunity != null)
        sourceCommunityExtent.push(communityExtentSum);
      communityExtentSum = {'sum': sourcesExtent[sourceOffset], 'community': currentCommunity};
    }
    else
      communityExtentSum.sum += sourcesExtent[sourceOffset];
    oldCommunity = currentCommunity;
  }
  sourceCommunityExtent.push(communityExtentSum);
  console.log(sourceCommunityExtent);

  var targetCommunityIntent = [];
  oldCommunity = null
  var communityIntentSum = 0

  for (var targetOffset in json['targets']) {
    var currentCommunity = json['targets'][targetOffset].community_category;
    if (currentCommunity != oldCommunity) {
      if (oldCommunity != null)
        targetCommunityIntent.push(communityIntentSum);
      communityIntentSum = {'sum': targetsIntent[targetOffset], 'community':currentCommunity};
    }
    else
      communityIntentSum.sum += targetsIntent[targetOffset];
    oldCommunity = currentCommunity;
  }
  targetCommunityIntent.push(communityIntentSum);
  console.log(targetCommunityIntent);

  var separationMatrix = {};
  for (var sourceOffset in sourceCommunityExtent) {
    for (var targetOffset in targetCommunityIntent) {
      var blocKey = (""+sourceCommunityExtent[sourceOffset].community) + ',' + (""+targetCommunityIntent[targetOffset].community);
      var lengthProduct = blocDisplay[blocKey].sourcesCount * blocDisplay[blocKey].targetsCount;
      separationMatrix[blocKey] = lengthProduct / (sourceCommunityExtent[sourceOffset].sum + targetCommunityIntent[targetOffset].sum + lengthProduct);
    }
  }
  console.log(separationMatrix);


  // TODO: replace
  //var interpolator = d3.interpolateRgbBasis(d3.schemeDark2);
  var matrix = json['matrix'];
  var squareSize = 10;
  var squarePadding = squareSize*1/3;
  var translation = 150;
  var width = translation + (json.targets.length+1)*(squareSize+squarePadding);
  var height = translation + (json.sources.length+1)*(squareSize+squarePadding);
  var endline='\n';

// Appending SVG root

  svgFile.write('<svg width="'+width+'" height="'+height+'">'+endline);
  

// Appending master g element
  svgFile.write('<g transform="translate('+translation + ',' + translation + ')">'+endline);

  // Matrix dots
  for (var i = 0; i < matrix.length; ++i) {
	// Appending line dots g
	var fillColor = 'rgb('
	+ (json.sources[i].community_category/json.total_source_communities * 255)+','
	+ (200*(json.sources[i].community_category%2))+','
	+ ( (1 - json.sources[i].community_category/json.total_source_communities) * 255)+')';
	svgFile.write('<g transform="translate(0,' + (i*(squarePadding+squareSize) + json.sources[i].community_category*squarePadding) + ')" fill="'+fillColor+'">'+endline);
	for (var j = 0; j < matrix[i].length; ++j) {
		// Appending dots rect
		var key = (''+json.sources[i].community_category) + ',' + (''+json.targets[j].community_category);
		
		svgFile.write('<rect'
		+' height="'+squareSize+'"'
		+' width="'+squareSize+'"'
		+' x="'+ (j*(squarePadding+squareSize) + json.targets[j].community_category*squarePadding) +'"'
		+' y="0"'
		+' opacity="'+ (blocDisplay[key].displayed ? (matrix[i][j] ? 1 : 0.3) : 0.05) + '"'
		+'></rect>');
	}
	svgFile.write('</g>'+endline);
  }
  // Appending source names
  for (var i= 0; i < json.sources.length; ++i) {
	var d = json.sources[i];
	svgFile.write('<text transform="rotate(0,0,' + ((i+1/2)*(squarePadding+squareSize) + d.community_category*squarePadding) + ')"'
	+ ' y="' + ((i+1/2)*(squarePadding+squareSize) + d.community_category*squarePadding) + '"'
	+ ' x="' + (-squarePadding) + '"'
	+ ' font-size="' + (squareSize*4/5) + '"'
	+ ' text-anchor="end"'
	+ '>');
	svgFile.write(xmlEntities(d.node));
	svgFile.write('</text>');
  }

  // Appending target names
  for (var i= 0; i < json.targets.length; ++i) {
	var d = json.targets[i];
	svgFile.write('<text transform="rotate(90,' + ((i+1/4)*(squarePadding+squareSize) + d.community_category*squarePadding) + ',0)"'
	+ ' x="' + ((i+1/4)*(squarePadding+squareSize) + (d.community_category - 1)*squarePadding) + '"'
	+ ' font-size="' + (squareSize*4/5) + '"'
	+ ' text-anchor="end"'
	+ '>');
	svgFile.write(xmlEntities(d.node));
	svgFile.write('</text>');
  }
  svgFile.write('</g>'+endline);
  svgFile.write('</svg>'+endline);
svgFile.end();

// Generated by CoffeeScript 1.11.1
var boundingBox, distance, estimateSymbolWidth, findAnchors, findClosestAnchor, findTwoClosestWords, findVariants, length, pixelsToConfidence, ref, ref1, selectWords, unpack, validate, wordsToConfidence, wordsToText,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

ref = require('./schema'), unpack = ref.unpack, validate = ref.validate;

ref1 = require('./math'), distance = ref1.distance, length = ref1.length, boundingBox = ref1.boundingBox;

findAnchors = function(textFields, words, schemaToPage) {
  var anchor, anchorFields, anchorWords, anchors, fieldIndex, index, j, k, l, len, len1, len2, matches, pageBox, textField, word, wordIndex;
  anchors = [];
  anchorFields = [];
  anchorWords = [];
  for (fieldIndex = j = 0, len = textFields.length; j < len; fieldIndex = ++j) {
    textField = textFields[fieldIndex];
    matches = [];
    for (wordIndex = k = 0, len1 = words.length; k < len1; wordIndex = ++k) {
      word = words[wordIndex];
      if (word.text.length > 3) {
        if (validate(textField, word.text, false)) {
          matches.push(wordIndex);
        }
      }
    }
    if (matches.length === 1) {
      word = words[matches[0]];
      if (indexOf.call(anchorWords, word) >= 0) {
        for (index = l = 0, len2 = anchors.length; l < len2; index = ++l) {
          anchor = anchors[index];
          if (anchor.word === word) {
            anchors.splice(index, 1);
            anchorFields.splice(index, 1);
            break;
          }
        }
        continue;
      }
      pageBox = schemaToPage(textField.box);
      if (Math.abs(word.box.x - pageBox.x) + Math.abs(word.box.y - pageBox.y) > 400) {
        continue;
      }
      anchor = {
        acceptedBy: textField.path,
        offset: {
          x: pageBox.x - word.box.x,
          y: pageBox.y - word.box.y
        },
        word: word
      };
      anchors.push(anchor);
      anchorWords.push(word);
    }
  }
  return anchors;
};

findTwoClosestWords = function(pageBox, words) {
  var wordDistances;
  wordDistances = words.map(function(word) {
    return {
      distance: Math.abs(word.box.x - pageBox.x) + Math.abs(word.box.y - pageBox.y),
      word: word
    };
  });
  wordDistances = wordDistances.filter(function(i) {
    return i.distance < 200;
  });
  wordDistances.sort(function(a, b) {
    return a.distance - b.distance;
  });
  return wordDistances.slice(0, 2).map(function(item) {
    return item.word;
  });
};

selectWords = function(words, box) {
  var bottom, diff, firstLine, firstLineDiff, j, k, len, len1, ref2, right, selectedWords, word;
  selectedWords = [];
  right = box.x + box.width;
  bottom = box.y + box.height;
  for (j = 0, len = words.length; j < len; j++) {
    word = words[j];
    if ((word.box.x + word.box.width / 2) < right && (word.box.x + word.box.width / 2) > box.x && word.box.y < bottom && word.box.y + word.box.height > box.y && ((ref2 = word.text) !== 'I' && ref2 !== '|' && ref2 !== '_' && ref2 !== '—')) {
      selectedWords.push(word);
    }
  }
  firstLine = void 0;
  firstLineDiff = 2e308;
  for (k = 0, len1 = selectedWords.length; k < len1; k++) {
    word = selectedWords[k];
    diff = Math.abs(box.y - word.box.y);
    if (diff < firstLineDiff) {
      firstLine = word.box.y;
      firstLineDiff = diff;
    }
  }
  return (function() {
    var l, len2, ref3, results;
    results = [];
    for (l = 0, len2 = selectedWords.length; l < len2; l++) {
      word = selectedWords[l];
      if ((firstLine - 10 <= (ref3 = word.box.y) && ref3 < firstLine + box.height - 5)) {
        results.push(word);
      }
    }
    return results;
  })();
};

estimateSymbolWidth = function(word) {
  var charWidth;
  charWidth = word.box.width / word.text.length;
  charWidth += 0.2 * charWidth / word.text.length;
  return charWidth;
};

wordsToText = function(words, extendedGapDetection) {
  var charWidth, fragment, gap, i, isFragment, j, k, l, lastWord, len, len1, len2, line, lines, minimumGap, spaces, text, word;
  if (extendedGapDetection == null) {
    extendedGapDetection = false;
  }
  lines = [[]];
  lastWord = words[0];
  words.sort(function(a, b) {
    return a.box.y + a.box.height - b.box.y - b.box.height;
  });
  for (j = 0, len = words.length; j < len; j++) {
    word = words[j];
    if (Math.abs(lastWord.box.y + lastWord.box.height - word.box.y - word.box.height) > 15) {
      lines.push([]);
    }
    lines[lines.length - 1].push(word);
    lastWord = word;
  }
  text = '';
  fragment = /^(|\w|\d\d)\/?$/;
  for (i = k = 0, len1 = lines.length; k < len1; i = ++k) {
    line = lines[i];
    if (i !== 0) {
      text += '\n';
    }
    line.sort(function(a, b) {
      return a.box.x - b.box.x;
    });
    gap = 0;
    minimumGap = 50;
    lastWord = null;
    for (i = l = 0, len2 = line.length; l < len2; i = ++l) {
      word = line[i];
      isFragment = fragment.test(word.text);
      if (lastWord != null) {
        charWidth = (estimateSymbolWidth(lastWord) + estimateSymbolWidth(word)) / 2;
        gap = word.box.x - (lastWord.box.x + lastWord.box.width);
        if (extendedGapDetection) {
          minimumGap = charWidth * 1.5;
        }
      }
      if ((i === 0) || (isFragment && fragment.test(lastWord.text) && gap < minimumGap)) {
        text += word.text;
      } else if (extendedGapDetection && gap > charWidth * 2) {
        spaces = Math.max(1, Math.floor(gap / charWidth));
        text += '   '.slice(0, spaces) + word.text;
      } else {
        text += ' ' + word.text;
      }
      lastWord = word;
    }
  }
  return text;
};

findClosestAnchor = function(anchors, pageBox) {
  var anchor, closest, dist, j, len, minDistance;
  minDistance = 2e308;
  closest = null;
  for (j = 0, len = anchors.length; j < len; j++) {
    anchor = anchors[j];
    dist = Math.abs(anchor.word.box.x - pageBox.x) + Math.abs(anchor.word.box.y - pageBox.y);
    if (dist < minDistance) {
      minDistance = dist;
      closest = anchor;
    }
  }
  return closest;
};

wordsToConfidence = function(words) {
  return Math.round(words.reduce((function(sum, word) {
    return sum + word.confidence;
  }), 0) / words.length);
};

pixelsToConfidence = function(box, image) {
  var blobImage, blobRatio, blobs, confidence, cropBox, x, y;
  x = Math.max(0, Math.min(image.width - 1, box.x));
  y = Math.max(0, Math.min(image.height - 1, box.y));
  cropBox = {
    x: x,
    y: y,
    width: Math.max(0, Math.min(image.width - x, box.width)),
    height: Math.max(0, Math.min(image.height - y, box.height))
  };
  if (cropBox.width === 0 || cropBox.height === 0) {
    return 50;
  }
  blobImage = image.crop(cropBox).threshold(248);
  blobs = blobImage.connectedComponents(8).filter(function(box) {
    return box.width > 4 && box.height > 6;
  });
  if (blobs.length > 0) {
    box = boundingBox(blobs);
    blobRatio = (box.width * box.height) / (blobImage.width * blobImage.height);
    confidence = Math.max(0, Math.round((0.33 - blobRatio) * 100));
  } else {
    confidence = 100;
  }
  return confidence;
};

findVariants = function(field, anchors, words, schemaToPage, image) {
  var candidateText, candidateWords, closeWords, closestAnchor, epsilonConfidence, isDuplicate, isValid, j, k, len, len1, pageBox, searchBox, searchBoxes, variants, word;
  pageBox = schemaToPage(field.box);
  closestAnchor = findClosestAnchor(anchors, pageBox);
  if (closestAnchor != null) {
    pageBox.x -= closestAnchor.offset.x;
    pageBox.y -= closestAnchor.offset.y;
  }
  closeWords = findTwoClosestWords(pageBox, words);
  searchBoxes = [
    {
      x: pageBox.x,
      y: pageBox.y,
      width: pageBox.width,
      height: pageBox.height,
      priority: 0
    }
  ];
  for (j = 0, len = closeWords.length; j < len; j++) {
    word = closeWords[j];
    searchBoxes.push({
      x: word.box.x,
      y: word.box.y,
      width: pageBox.width,
      height: pageBox.height,
      priority: 2
    });
    searchBoxes.push({
      x: word.box.x,
      y: word.box.y,
      width: pageBox.width * 0.9,
      height: pageBox.height * 0.9,
      priority: 3
    });
    searchBoxes.push({
      x: word.box.x,
      y: word.box.y,
      width: pageBox.width * 1.1,
      height: pageBox.height * 1.1,
      priority: 3
    });
  }
  variants = [];
  for (k = 0, len1 = searchBoxes.length; k < len1; k++) {
    searchBox = searchBoxes[k];
    candidateWords = selectWords(words, searchBox);
    if (candidateWords.length > 0) {
      candidateText = wordsToText(candidateWords, field.extendedGapDetection);
      isDuplicate = variants.some(function(variant) {
        return variant.text === candidateText;
      });
      if (isDuplicate) {
        continue;
      }
      isValid = validate(field, candidateText, true);
      if (!isValid) {
        continue;
      }
      variants.push({
        path: field.path,
        confidence: wordsToConfidence(candidateWords),
        box: boundingBox((function() {
          var l, len2, results;
          results = [];
          for (l = 0, len2 = candidateWords.length; l < len2; l++) {
            word = candidateWords[l];
            results.push(word.box);
          }
          return results;
        })()),
        text: candidateText,
        words: candidateWords,
        used: false,
        priority: [isValid, searchBox.priority]
      });
    }
  }
  epsilonConfidence = pixelsToConfidence(pageBox, image);
  if (epsilonConfidence > 50 || variants.length === 0) {
    isValid = validate(field, '', false);
    variants.push({
      path: field.path,
      confidence: epsilonConfidence,
      box: pageBox,
      text: '',
      words: [],
      used: false,
      priority: [isValid, 1]
    });
  }
  variants.sort(function(a, b) {
    var deltaPriority, deltaValid;
    deltaValid = b.priority[0] - a.priority[0];
    deltaPriority = a.priority[1] - b.priority[1];
    if (deltaValid === 0) {
      return deltaPriority;
    } else {
      return deltaValid;
    }
  });
  return variants;
};

module.exports.matchText = function(formData, formSchema, words, schemaToPage, rawImage) {
  var anchors, choice, conflictingVariants, conflicts, field, fieldData, fieldIndex, image, j, k, l, len, len1, len10, len2, len3, len4, len5, len6, len7, len8, len9, m, n, o, p, path, q, r, ref2, ref3, ref4, ref5, ref6, ref7, s, selectedVariant, selectedVariants, t, textFields, values, variant, variants, variantsByPath, variantsByWord, word, wordIndex, wordUsage, wordVariant;
  textFields = formSchema.fields.filter(function(field) {
    return field.type === 'text';
  });
  if (textFields.length === 0) {
    return {};
  }
  textFields.sort(function(a, b) {
    var deltaX, deltaY;
    deltaY = a.box.y - b.box.y;
    deltaX = a.box.x - b.box.x;
    if (Math.abs(deltaY) < 20) {
      return deltaX;
    } else {
      return deltaY;
    }
  });
  image = rawImage.toGray();
  anchors = findAnchors(textFields, words, schemaToPage);
  variantsByPath = {};
  variantsByWord = {};
  for (j = 0, len = textFields.length; j < len; j++) {
    field = textFields[j];
    variants = findVariants(field, anchors, words, schemaToPage, image);
    variantsByPath[field.path] = variants;
    for (k = 0, len1 = variants.length; k < len1; k++) {
      variant = variants[k];
      ref2 = variant.words;
      for (l = 0, len2 = ref2.length; l < len2; l++) {
        word = ref2[l];
        wordIndex = words.indexOf(word);
        if (variantsByWord[wordIndex] == null) {
          variantsByWord[wordIndex] = [];
        }
        variantsByWord[wordIndex].push(variant);
      }
    }
  }
  for (m = 0, len3 = textFields.length; m < len3; m++) {
    field = textFields[m];
    variants = variantsByPath[field.path];
    if (variants.length === 1 && variants[0].words.length === 1) {
      word = variants[0].words[0];
      wordIndex = words.indexOf(word);
      ref3 = variantsByWord[wordIndex];
      for (n = 0, len4 = ref3.length; n < len4; n++) {
        variant = ref3[n];
        if (variant.path === field.path) {
          continue;
        }
        conflictingVariants = variantsByPath[variant.path];
        if (conflictingVariants.length > 1) {
          conflictingVariants.splice(conflictingVariants.indexOf(variant), 1);
        }
      }
    }
  }
  selectedVariants = [];
  wordUsage = [];
  for (o = 0, len5 = textFields.length; o < len5; o++) {
    field = textFields[o];
    variants = variantsByPath[field.path].filter(function(variant) {
      return !variant.used;
    });
    if (variants.length === 0) {
      variants = variantsByPath[field.path];
    }
    if (variants.length > 1 && (field.fieldSelector != null)) {
      values = variants.map(function(variant) {
        return variant.text;
      });
      choice = field.fieldSelector(values);
      if (!(choice in values)) {
        throw new Error('Returned choice index out of bounds');
      }
    } else {
      choice = 0;
    }
    selectedVariants.push(selectedVariant = variants[choice]);
    ref4 = selectedVariant.words;
    for (p = 0, len6 = ref4.length; p < len6; p++) {
      word = ref4[p];
      wordIndex = words.indexOf(word);
      ref5 = variantsByWord[wordIndex];
      for (q = 0, len7 = ref5.length; q < len7; q++) {
        wordVariant = ref5[q];
        wordVariant.used = true;
      }
      if (wordUsage[wordIndex] == null) {
        wordUsage[wordIndex] = [];
      }
      wordUsage[wordIndex].push(field.path);
    }
  }
  for (fieldIndex = r = 0, len8 = textFields.length; r < len8; fieldIndex = ++r) {
    field = textFields[fieldIndex];
    selectedVariant = selectedVariants[fieldIndex];
    conflicts = [field.path];
    ref6 = selectedVariant.words;
    for (s = 0, len9 = ref6.length; s < len9; s++) {
      word = ref6[s];
      wordIndex = words.indexOf(word);
      ref7 = wordUsage[wordIndex];
      for (t = 0, len10 = ref7.length; t < len10; t++) {
        path = ref7[t];
        if (indexOf.call(conflicts, path) < 0) {
          conflicts.push(path);
        }
      }
    }
    conflicts.splice(0, 1);
    fieldData = unpack(formData, field.path);
    fieldData.value = selectedVariant.text;
    fieldData.confidence = selectedVariant.confidence;
    fieldData.box = selectedVariant.box;
    fieldData.conflicts = conflicts;
  }
  return {
    anchors: anchors
  };
};
{unpack, validate} = require './schema'
{distance, length, boundingBox} = require './math'

# Find anchor words (unique matches).
findAnchors = (textFields, words, schemaToPage) ->
	anchors = []
	anchorFields = []
	anchorWords = []
	for textField, fieldIndex in textFields
		matches = []
		for word, wordIndex in words when word.text.length > 3
			if validate textField, word.text, false
				matches.push wordIndex
		if matches.length is 1
			word = words[matches[0]]
			if word in anchorWords
				# Uniqueness check failed: This is at least the second field subscribing to `word`.
				# Pull the existing one from anchors and skip this one completely.
				#console.log 'Duplicate subscription on', word.text
				for anchor, index in anchors
					if anchor.word is word
						anchors.splice index, 1
						anchorFields.splice index, 1
						break
				continue

			# Safeguard: Disregard matches that are too far off
			pageBox = schemaToPage textField.box
			continue if Math.abs(word.box.x - pageBox.x) + Math.abs(word.box.y - pageBox.y) > 400
			#console.log 'Unique match:', textField, word
			anchor =
				acceptedBy: textField.path
				offset:
					x: pageBox.x - word.box.x
					y: pageBox.y - word.box.y
				word: word
			anchors.push anchor
			anchorWords.push word

	return anchors

# Find close words in a box.
findTwoClosestWords = (pageBox, words) ->
	wordDistances = words.map (word) -> {distance: Math.abs(word.box.x - pageBox.x) + Math.abs(word.box.y - pageBox.y), word}
	wordDistances = wordDistances.filter (i) -> i.distance < 200
	wordDistances.sort (a, b) -> a.distance - b.distance
	return wordDistances[...2].map (item) -> item.word

# Select words in a box.
selectWords = (words, box) ->
	selectedWords = []
	right = box.x + box.width
	bottom = box.y + box.height
	for word in words
		# Select all words that are at least 50% within box in x direction,
		# touch box in y direction, and are none of the typical 'character garbage'.
		if (word.box.x + word.box.width / 2) < right and (word.box.x + word.box.width / 2) > box.x and
				word.box.y < bottom and word.box.y + word.box.height > box.y and
				word.text not in ['I', '|', '_', '—']
			selectedWords.push word

	# Now decide which words in y direction to take: First line is the one which is nearest to specified y.
	firstLine = undefined
	firstLineDiff = Infinity

	for word in selectedWords
		diff = Math.abs box.y - word.box.y
		if diff < firstLineDiff
			firstLine = word.box.y
			firstLineDiff = diff
	#console.log 'Chosen as first line:', firstLine
	return (word for word in selectedWords when firstLine - 10 <= word.box.y < firstLine + box.height - 5)

# Estimate width of symbols from a word.
estimateSymbolWidth = (word) ->
	charWidth = word.box.width / word.text.length
	# Compensate for padding of outermost characters
	charWidth += 0.2 * charWidth / word.text.length
	return charWidth
	
# Convert words in random order to a single block of text.
wordsToText = (words, extendedGapDetection = false) ->
	# Extract lines from Y difference peaks.
	lines = [[]]
	lastWord = words[0]
	words.sort((a, b) -> a.box.y + a.box.height - b.box.y - b.box.height)
	for word in words
		if Math.abs(lastWord.box.y + lastWord.box.height - word.box.y - word.box.height) > 15
			lines.push []
		lines[lines.length - 1].push word
		lastWord = word

	# Put lines in reading order and join them.
	text = ''
	# Make an attempt to repair words splitted into characters, e.g. 'J 1 2/ 34 5'.
	fragment = /^(|\w|\d\d)\/?$/
	for line, i in lines
		text += '\n' unless i is 0
		line.sort((a, b) -> a.box.x - b.box.x)
		gap = 0
		minimumGap = 50
		lastWord = null
		for word, i in line
			isFragment = fragment.test word.text
			if lastWord?
				charWidth = (estimateSymbolWidth(lastWord) + estimateSymbolWidth(word)) / 2
				gap = word.box.x - (lastWord.box.x + lastWord.box.width)
				minimumGap = charWidth * 1.5 if extendedGapDetection
			if (i is 0) or (isFragment and fragment.test(lastWord.text) and gap < minimumGap)
				text += word.text
			else if extendedGapDetection and gap > charWidth * 2
				# Insert up to three spaces depending on gap
				spaces = Math.max 1, Math.floor(gap / charWidth)
				text += '   '[...spaces] + word.text
			else
				text += ' ' + word.text
			lastWord = word

	return text

# Find closest anchor.
findClosestAnchor = (anchors, pageBox) ->
	minDistance = Infinity
	closest = null
	for anchor in anchors
		dist = Math.abs(anchor.word.box.x - pageBox.x) + Math.abs(anchor.word.box.y - pageBox.y)
		if dist < minDistance
			minDistance = dist
			closest = anchor
	return closest

# Compute confidence from words.
wordsToConfidence = (words) ->
	return Math.round(words.reduce(((sum, word) -> sum + word.confidence), 0) / words.length)

# Compute confidence from pixels inside box.
pixelsToConfidence = (box, image) ->
	# Sanitize box to image.
	x = Math.max(0, Math.min(image.width - 1, box.x))
	y = Math.max(0, Math.min(image.height - 1, box.y))
	cropBox =
		x: x
		y: y
		width: Math.max(0, Math.min(image.width - x, box.width))
		height: Math.max(0, Math.min(image.height - y, box.height))
	return 50 if cropBox.width is 0 or cropBox.height is 0
	# Search for pixel blobs and compute confidence.
	blobImage = image.crop(cropBox).threshold(248)
	blobs = blobImage.connectedComponents(8).filter (box) -> box.width > 4 and box.height > 6
	if blobs.length > 0
		box = boundingBox blobs
		blobRatio = (box.width * box.height) / (blobImage.width * blobImage.height)
		confidence = Math.max(0, Math.round((0.33 - blobRatio) * 100))
	else
		confidence = 100
	return confidence

# Find text variants and assign a priority:
#   valid content > valid epsilon > positional content > positional epsilon
findVariants = (field, anchors, words, schemaToPage, image) ->
	pageBox = schemaToPage field.box

	closestAnchor = findClosestAnchor anchors, pageBox
	if closestAnchor?
		pageBox.x -= closestAnchor.offset.x
		pageBox.y -= closestAnchor.offset.y

	closeWords = findTwoClosestWords pageBox, words
	
	# Generate search boxes.
	searchBoxes = [
		x: pageBox.x
		y: pageBox.y
		width: pageBox.width
		height: pageBox.height
		priority: 0
	]
	for word in closeWords
		searchBoxes.push
			x: word.box.x
			y: word.box.y
			width: pageBox.width
			height: pageBox.height
			priority: 2
		searchBoxes.push
			x: word.box.x
			y: word.box.y
			width: pageBox.width * 0.9
			height: pageBox.height * 0.9
			priority: 3
		searchBoxes.push
			x: word.box.x
			y: word.box.y
			width: pageBox.width * 1.1
			height: pageBox.height * 1.1
			priority: 3

	# Map words to variants using search boxes.
	variants = []
	for searchBox in searchBoxes
		candidateWords = selectWords words, searchBox
		if candidateWords.length > 0
			candidateText = wordsToText candidateWords, field.extendedGapDetection
			isDuplicate = variants.some (variant) -> variant.text is candidateText
			continue if isDuplicate
			isValid = validate field, candidateText, true
			continue if not isValid
			variants.push
				path: field.path
				confidence: wordsToConfidence candidateWords
				box: boundingBox (word.box for word in candidateWords)
				text: candidateText
				words: candidateWords
				used: false
				priority: [isValid, searchBox.priority]

	# Insert epsilon variant when confident or nothing else was found.
	epsilonConfidence = pixelsToConfidence pageBox, image
	if epsilonConfidence > 50 or variants.length is 0
		isValid = validate field, '', false
		variants.push
			path: field.path
			confidence: epsilonConfidence
			box: pageBox
			text: ''
			words: []
			used: false
			priority: [isValid, 1]

	variants.sort (a, b) ->
		deltaValid = b.priority[0] - a.priority[0]
		deltaPriority = a.priority[1] - b.priority[1]
		if deltaValid is 0
			return deltaPriority
		else
			return deltaValid

	return variants

# Match text to form schema.
#
# This process is content- and location-sensitive.
module.exports.matchText = (formData, formSchema, words, schemaToPage, rawImage) ->
	textFields = formSchema.fields.filter((field) -> field.type is 'text')
	return {} if textFields.length is 0
	
	textFields.sort (a, b) -> 
		deltaY = a.box.y - b.box.y
		deltaX = a.box.x - b.box.x
		if Math.abs(deltaY) < 20
			return deltaX
		else
			return deltaY
	image = rawImage.toGray()

	# Find anchors to compensate for *very* inaccurate printing.
	anchors = findAnchors textFields, words, schemaToPage
	#console.log 'anchors', anchors

	# Map words to variants.
	variantsByPath = {}
	variantsByWord = {}
	for field in textFields
		variants = findVariants field, anchors, words, schemaToPage, image
		variantsByPath[field.path] = variants
		for variant in variants
			for word in variant.words
				wordIndex = words.indexOf word
				variantsByWord[wordIndex] ?= []
				variantsByWord[wordIndex].push variant
	
	# Solve simple conflicts automatically (before passing to fieldSelector).
	# For the case that a field has only a single one-word variant available, remove that option from
	# everything else (except if this would in turn bring those fields' variants to zero).
	for field in textFields
		variants = variantsByPath[field.path]
		if variants.length is 1 and variants[0].words.length is 1
			word = variants[0].words[0]
			wordIndex = words.indexOf word
			for variant in variantsByWord[wordIndex]
				continue if variant.path is field.path
				conflictingVariants = variantsByPath[variant.path]
				if conflictingVariants.length > 1
					#console.log 'Removing ' + JSON.stringify(variant.text) + ' from ' + variant.path +
					#	' because ' + JSON.stringify(word.text) + ' is the only valid option for ' + field.path
					conflictingVariants.splice conflictingVariants.indexOf(variant), 1
			

	# Reduce to fields.
	selectedVariants = []
	wordUsage = []
	for field in textFields
		variants = variantsByPath[field.path].filter (variant) -> not variant.used
		# All variants are marked as used... TODO: Assign epsilon instead?
		if variants.length is 0
			variants = variantsByPath[field.path]
		# Choose variant.
		#console.log field.path, variants.map (variant) -> variant.text
		if variants.length > 1 and field.fieldSelector?
			values = variants.map (variant) -> variant.text
			choice = field.fieldSelector values
			if choice not of values
				throw new Error('Returned choice index out of bounds')
		else
			choice = 0
		selectedVariants.push selectedVariant = variants[choice]
		for word in selectedVariant.words
			wordIndex = words.indexOf word
			# Mark conflicting variants as used.
			for wordVariant in variantsByWord[wordIndex]
				wordVariant.used = true
			# Mark word as used.
			wordUsage[wordIndex] ?= []
			wordUsage[wordIndex].push field.path

	for field, fieldIndex in textFields
		selectedVariant = selectedVariants[fieldIndex]
		# Compute conflicts.
		conflicts = [field.path]
		for word in selectedVariant.words
			wordIndex = words.indexOf word
			for path in wordUsage[wordIndex] when path not in conflicts
				conflicts.push path
		conflicts.splice(0, 1)
		# Assign variant to field.
		fieldData = unpack formData, field.path
		fieldData.value = selectedVariant.text
		fieldData.confidence = selectedVariant.confidence
		fieldData.box = selectedVariant.box
		fieldData.conflicts = conflicts

	return {anchors}

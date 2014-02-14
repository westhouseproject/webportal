function getField(err) {
  var field = err.message.match(/[a-zA-Z123_]+'$/)[0].slice(0, -1);
  
  var firstHalfLen = 'ER_DUP_ENTRY: Duplicate entry \''.length;
  var secondHalfLen = '\' for key \''.length + field.length + 1;

  var value = err.message.slice(firstHalfLen, -secondHalfLen);

  return {
    field: field,
    value: value
  }
}

var err = new Error('ER_DUP_ENTRY: Duplicate entry \'shovoadsfladklf94954959n\' for key \'useralkdjflakname\'')

console.log(getField(err));
(function(window){
  window.extractData = function() {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart)  {      
      if (smart.hasOwnProperty('patient')) {
        
        console.log(smart);
        var patient = smart.patient;
        var pt = patient.read();
        var obv = smart.patient.api.fetchAll({
                    type: 'Observation',
                    query: {
                      code: {
                        $or: ['http://loinc.org|8302-2', 'http://loinc.org|8462-4',
                              'http://loinc.org|8480-6', 'http://loinc.org|2085-9',
                              'http://loinc.org|2089-1', 'http://loinc.org|55284-4']
                      }
                    }
                  });
        
        
        var reqproc = smart.patient.api.fetchAll({
                    type: 'ProcedureRequest',
                    query: {}
                  });
        
        var reports = smart.patient.api.fetchAll({
                    type: 'DiagnosticReport',
                    query: {}
                  });
        
        $.when(pt, obv, reqproc, reports).fail(onError);

        $.when(pt, obv, reqproc, reports).done(function(patient, obv, reqproc, reports) {
          var byCodes = smart.byCodes(obv, 'code');
          /*
          var byCodesReqProc = smart.byCodes(reqproc, 'code');
          */
          var gender = patient.gender;

          var fname = '';
          var lname = '';

          if (typeof patient.name[0] !== 'undefined') {
            fname = patient.name[0].given.join(' ');
            lname = patient.name[0].family.join(' ');
          }

          var height = byCodes('8302-2');
          var systolicbp = getBloodPressureValue(byCodes('55284-4'),'8480-6');
          var diastolicbp = getBloodPressureValue(byCodes('55284-4'),'8462-4');
          var hdl = byCodes('2085-9');
          var ldl = byCodes('2089-1');
          
          var reason = '';
          
          if (typeof reqproc != 'undefined') {
            
            console.log('reqproc object', reqproc);
            
            for (var i = 0; i < reqproc.length; i++) {
              reason += reqproc[i].text.div;
              
              if (typeof reqproc[i].reasonCodeableConcept != 'undefined') {
                reason += "<b>Reason: </b>" + JSON.stringify(reqproc[i].reasonCodeableConcept, null, 4);
                /*
                console.log("Found a reason for requested procedure at index " + i);
                */
              }
              
              reason += '<br><br>'
            } 
          }
          
          var reportsString = '';
          
          if (typeof reports != 'undefined') {
            
            console.log('reports object', reports);
            
            for (var i = 0; i < reports.length; i++) {
              reportsString += reports[i].text.div;
              
              if (reports[i].presentedForm != 'undefined') {
                console.log('Found presentedForm for report ' + i);
                
                for (var j = 0; j < reports[i].presentedForm.length; j++) {
                  if (reports[i].presentedForm[j].contentType != 'undefined') {
                    console.log('Presented form ' + j + ' content type: ' + reports[i].presentedForm[j].contentType);  
                    
                    if (reports[i].presentedForm[j].contentType == 'text/html') {
                      var url = reports[i].presentedForm[j].url;
                      console.log('URL: ' + url);
                      /*
                      if (url != 'undefined') {
                       $.get( url, function( data ) {
                         var reportText = data;
                         window.alert(reportText);
                         reportsString += reportText
                       });
                      */
                      var xhr= new XMLHttpRequest();
                      xhr.open('GET', url, true);
                      xhr.setRequestHeader("Accept", "text/html");
                      xhr.setRequestHeader("Authorization", "Bearer " + smart.tokenResponse.access_token);
                      xhr.onreadystatechange = function() {
                        if (this.readyState !== 4) return;
                        if (this.status !== 200) {
                          console.log("Error fetching URL, status = " + this.status);
                          return; // or whatever error handling you want
                        }
                        var reportText = this.responseText;
                      };
                      console.log(xhr);
                      xhr.send();
                    } 
                  }
                }
              }
              reportsString += '<br><br>'
            }            
          }
          /*
          window.alert("typeof reqproc =" + (typeof reqproc));
          
          if (typeof reqproc != 'undefined') {
            window.alert("typeof reqproc[0] =" + (typeof reqproc[0]));
            if (typeof reqproc[0].code != 'undefined') {
              window.alert("typeof reqproc[0].code =" + (typeof reqproc[0].code));
            }
            if (typeof reqproc[0] != 'undefined') {
              window.alert("typeof reqproc[0].reasonCodeableConcept =" + (typeof reqproc[0].reasonCodeableConcept));
              reason = reqproc[0].reasonCodeableConcept;
            }
          }
          */
          
          var p = defaultPatient();
          p.birthdate = patient.birthDate;
          p.gender = gender;
          p.fname = fname;
          p.lname = lname;
          p.height = getQuantityValueAndUnit(height[0]);          
          p.reason = reason;
          p.reports = reportsString;

          if (typeof systolicbp != 'undefined')  {
            p.systolicbp = systolicbp;
          }

          if (typeof diastolicbp != 'undefined') {
            p.diastolicbp = diastolicbp;
          }

          p.hdl = getQuantityValueAndUnit(hdl[0]);
          p.ldl = getQuantityValueAndUnit(ldl[0]);

          ret.resolve(p);
        });
      } else {
        onError();
      }
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();

  };

  function defaultPatient(){
    return {
      fname: {value: ''},
      lname: {value: ''},
      gender: {value: ''},
      birthdate: {value: ''},
      height: {value: ''},
      systolicbp: {value: ''},
      diastolicbp: {value: ''},
      ldl: {value: ''},
      hdl: {value: ''},
      reason: {value: ''},
      reports: {value: ''},
    };
  }

  function getBloodPressureValue(BPObservations, typeOfPressure) {
    var formattedBPObservations = [];
    BPObservations.forEach(function(observation){
      var BP = observation.component.find(function(component){
        return component.code.coding.find(function(coding) {
          return coding.code == typeOfPressure;
        });
      });
      if (BP) {
        observation.valueQuantity = BP.valueQuantity;
        formattedBPObservations.push(observation);
      }
    });

    return getQuantityValueAndUnit(formattedBPObservations[0]);
  }

  function getQuantityValueAndUnit(ob) {
    if (typeof ob != 'undefined' &&
        typeof ob.valueQuantity != 'undefined' &&
        typeof ob.valueQuantity.value != 'undefined' &&
        typeof ob.valueQuantity.unit != 'undefined') {
          return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;
    } else {
      return undefined;
    }
  }

  window.drawVisualization = function(p) {
    $('#holder').show();
    $('#loading').hide();
    $('#fname').html(p.fname);
    $('#lname').html(p.lname);
    $('#gender').html(p.gender);
    $('#birthdate').html(p.birthdate);
    $('#height').html(p.height);
    $('#systolicbp').html(p.systolicbp);
    $('#diastolicbp').html(p.diastolicbp);
    $('#ldl').html(p.ldl);
    $('#hdl').html(p.hdl);
    $('#reason').html(p.reason);
    $('#report').html(p.reports);
  };

})(window);

// Use module.exports to export the functions that should be
// available to use from this package.
// module.exports = { <your_function> }

// Once exported, use this statement in your scripts to use the package.
// const myPackage = pm.require('<package_name>')
// Various utility functions to be run as part of  the Pre-Request Script and Test phases of the collection

//Utilities to run in Tests

utils = {
   // Update baseUrls for existing Better Ehrscape environments
    tidyLegacyEnvironments: function(pm) {
        
        if (pm.environment.has('ehrscapeBaseUrl') &&  pm.environment.get('ehrscapeBaseUrl') !== '')
            return
 
        if (pm.environment.has('openEhrApi') && (!pm.environment.has('cdrRestBaseURL') || pm.environment.get('cdrRestBaseURL') === '')) {
            const oldURL = pm.environment.get('openEhrApi');
            pm.environment.set('cdrRestBaseURL', oldURL + "/rest/v1");
        }

        const oldBaseUrl = pm.environment.get('cdrRestBaseURL');
        // add Ehrscape endpoint url
        if (oldBaseUrl !== undefined && !pm.environment.has('ehrscapeBaseUrl')) {
            pm.environment.set('ehrscapeBaseUrl', oldBaseUrl);
        }

        //Add openEHR endpoint url
        if (oldBaseUrl !== undefined && !pm.environment.has('openehrBaseUrl')) {
            pm.environment.set('openehrBaseUrl', oldBaseUrl.replace("/rest/v1", "/rest/openehr/v1"));
        }

        //Tidy unused older environment variables
        pm.environment.unset('cdrRestBaseURL');
        pm.environment.unset('openEhrApi');
        pm.environment.unset('domainName');
        pm.environment.unset('domainSystemId');

    },

    //Format the ehrStatus object that needs to be sent in the Request body
    formatEhrStatusBody : function(pm) {
        const ehrStatus = {
            _type: "EHR_STATUS",
            archetype_node_id: "openEHR-EHR-EHR_STATUS.generic.v1",
            name: {
                _type: "DV_TEXT",
                value: "ehr status"
            },
            subject: {
                external_ref: {
                    id: {
                        _type: "HIER_OBJECT_ID",
                        value: '{{subjectId}}',
                    },
                    namespace: '{{subjectNamespace}}',
                    type: "PERSON" // This is overwritten to 'PARTY_REF' in BetterCDR
                }
            },
            // If not specified these default to false in EhrBase and true in BetterCDR
            is_modifiable: true,
            is_queryable: true
        }
    //Place the formatted ehr object in the Request body
    pm.request.body = JSON.stringify({ ... ehrStatus })  
    },
  
      //Extracts an ID from the ETag header
    // by stripping any enclosing double-qoutes.
     fetchIdFromHeaderTag: function (pm) {
        return pm.response.headers.get('Etag')?.replace(/(^"|"$)/g, '');
    },

     //extracts an ID from the trailing segment of the Location header
    // e.g can extract a templateId
     fetchIdFromHeaderLocation: function (pm) {
        const splitLocation = pm.response.headers.get('Location')?.split('/')
        return decodeURI(splitLocation[splitLocation.length - 1])
    },

    // sets an Enviroment variable from the trailing segment of the Location header
    // e.g can extract a templateId
    setEnvFromHeaderLocation: function (pm, envName) {
        const iD = fetchIdFromHeaderLocation(pm)
        pm.environment.set(envName, iD)
        return iD
    },

    // sets an Enviroment variable from the ETag header
    // by stripping any enclosing double-qoutes.
    setEnvFromHeaderTag: function (pm, envName) {
        const envValue = fetchIdFromHeaderTag(pm);
        if (envValue)
            pm.environment.set(envName, envValue)
        return envValue
    },
  

    //Checks if the 'ForceOptUpload' postman variable is set (normally via the Collection Variables tab)
    // If 'false' then the Upload .opt step is skipped
    checkForceOptUpload: function (nextRequestId) {

        let forceOpt = false //Default to skipping Upload

        if (pm.variables.has("ForceOptUpload")) {
            forceOpt = pm.variables.get("ForceOptUpload");
        }
        console.log(`ForceOpt = ${forceOpt}`);

        const templateId = pm.environment.get('templateId')

        if (forceOpt === 'true')
            pm.test(`'${templateId}' .opt will be uploaded`);
        else {
            postman.setNextRequest(nextRequestId);
            pm.test(`'${templateId}' .opt will NOT be uploaded`);
        }
    },

    //Checks a success return code and if so updates the compositionId environment variable
    // EHRSCAPE /composition only
    updateEhrscapeCompositionUid: function (pm) {

        const statusCode = (pm.request.method === 'POST') ? 201 : 200;
        const passed = pm.response.to.have.status(statusCode);
        if (passed && (statusCode === 201)) {
            pm.environment.set('compositionId', pm.response.json().compositionUid)
        }
        return success
    },

    testEhrscapeCompositions: function (pm) {

        const statusCode = (pm.request.method === 'POST') ? 201 : 200;
        pm.test(`Status code is ${statusCode}`, function () {

            const statusCode = (pm.request.method === 'POST') ? 201 : 200;
            const passed = pm.response.to.have.status(statusCode);
            if (passed && (statusCode === 201)) {
               setCompVersionedObjectId(pm.response.json().compositionUid)
            }
            return passed
        });
    },

    setCompVersionedObjectId: function (pm, compId) {
        console.log('compositionId', compId)
        const versionId = compId.split('::')[0]
        console.log('precedingVersionUid', versionId)
        pm.environment.set("compositionId", compId)
        pm.environment.set('precedingVersionUid', versionId)
      
    },

     testCanonicalComposition: function (pm,updateEnvironment) {

        const statusCode = (pm.request.method === 'POST') ? 201 : 200;
        pm.test(`Status code is ${statusCode}`, function () {
 //           const statusCode = (pm.request.method === 'POST') ? 201 : 200;
            
            const passed =  pm.expect(pm.response.code).to.be.oneOf([statusCode,204])
            if (passed && updateEnvironment) {
                setCompVersionedObjectId(pm,testUtils.stripIdFromHeaderTag(pm))
            }
            return passed
        });
    },

    testQueryHasRows: function (pm) {

        pm.test("Status code is 200", function () {
            const passed = pm.response.to.have.status(200);
            if (passed) {
                pm.test("Resultset has rows", function () {
                    pm.response.json().rows[0][0].length > 0
                });
                return passed
            }
        });

    },

    testQueryHasZeroRows: function (pm) {

        pm.test("Status code is 200", function () {
            const passed = pm.response.to.have.status(200);
            if (passed) {
                pm.test("Resultset has No Rows", function () {
                    pm.response.json().hasOwnProperty('rows')
                });
                return passed
            }
        });
    }
}

module.exports = {utils}
xhr.onreadystatechange = function (oEvent) {
    if(xhr.readyState === 4){
        // Checking status codes
        if(xhr.status === 200){
            // user logged in
            window.location = '/index';
        }
        else{
            // login failed
            console.log(xhr.status);
            onError();
        }

    }
}
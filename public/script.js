;(function(){
	NodeList.prototype.forEach = Array.prototype.forEach; // extend the NodeList prototype
	
	var deleteButtons = document.querySelectorAll('.delete');
	deleteButtons.forEach(function(btn) {
		btn.addEventListener('click', handleDelete);
	});

	function handleDelete() {
		var file = this.getAttribute('data-file');

		axios.delete('/file/' + file).then(function(res) {
			this.removeEventListener('click', handleDelete);
			this.parentNode.classList.add('hide');
		}.bind(this));
	}

})(axios);